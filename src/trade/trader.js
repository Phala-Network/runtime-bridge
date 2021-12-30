import { DB_WORKER, setupDb } from '../data_provider/io/db'
import {
  TX_DEAD_COUNT_THRESHOLD,
  TX_SEND_QUEUE_SIZE,
  TX_TIMEOUT,
} from '../utils/constants'
import { getPool } from '../lifecycle/worker'
import { phalaApi, setupPhalaApi } from '../utils/api'
import PQueue from 'p-queue'
import env from '../utils/env'
import logger from '../utils/logger'

export const MA_ONLINE = 'MA_ONLINE'
export const MA_ERROR = 'MA_ERROR'
export const MA_ADD_BATCH = 'MA_ADD_BATCH'
export const MA_BATCH_ADDED = 'MA_BATCH_ADDED'
export const MA_BATCH_REJECTED = 'MA_BATCH_REJECTED'
export const MA_BATCH_WORKING = 'MA_BATCH_WORKING'
export const MA_BATCH_FINISHED = 'MA_BATCH_FINISHED'
export const MA_BATCH_FAILED = 'MA_BATCH_FAILED'

export class TxTimeOutError extends Error {
  constructor(m) {
    super(m)
    this.name = 'TxTimeOutError'
  }
}

const poolQueues = {}
const poolNonces = {}

const getPoolQueue = (pid) => {
  let q = poolQueues[pid]
  if (q) {
    return q
  }
  q = new PQueue({ concurrency: 1 })
  poolQueues[pid] = q
  return q
}

const start = async () => {
  await setupDb(DB_WORKER)
  await setupPhalaApi(env.chainEndpoint)

  const __fakeLifecycleContext = { pools: new Map() }

  let deadCount = 0

  const processQueue = new PQueue({ concurrency: TX_SEND_QUEUE_SIZE })
  const addQueue = new PQueue({ concurrency: 1 })

  const addBatchJob = (batch) => addQueue.add(() => doAddJob(batch))
  const doAddJob = async (batch) => {
    if (deadCount > TX_DEAD_COUNT_THRESHOLD) {
      return rejectJob(batch)
    }
    deadCount += 1
    process.send({
      action: MA_BATCH_ADDED,
      payload: {
        id: batch.id,
      },
    })
    processQueue
      .add(() => getPoolQueue(batch.pid).add(() => processBatch(batch)))
      .catch((e) => logger.error(e))
  }
  const rejectJob = async (batch) => {
    await processQueue.onIdle()
    process.send({
      action: MA_BATCH_REJECTED,
      payload: {
        id: batch.id,
      },
    })
  }

  const formTx = (pool, calls) => {
    const txs = calls.map((c) =>
      c.reduce(
        (prev, curr) => (typeof curr === 'string' ? prev[curr] : prev(...curr)),
        phalaApi
      )
    )
    const batchTx = phalaApi.tx.utility.batchTry(txs)
    return pool.isProxy
      ? phalaApi.tx.proxy.proxy(pool.realPhalaSs58, null, batchTx)
      : batchTx
  }

  const processBatch = async (batch) => {
    const pool = await getPool(batch.pid, __fakeLifecycleContext, true)
    const tx = formTx(pool, batch.calls)
    let nonce
    try {
      if (typeof poolNonces[pool.uid] === 'number') {
        nonce = (
          await phalaApi.rpc.system.accountNextIndex(pool.ss58Phala)
        ).toNumber()
      } else {
        nonce = poolNonces[pool.uid]
      }
      poolNonces[pool.uid] = nonce + 1
      process.send({ action: MA_BATCH_WORKING, payload: { id: batch.id } })
      const failedCalls = await sendTx(tx, pool, nonce)
      process.send({
        action: MA_BATCH_FINISHED,
        payload: { id: batch.id, failedCalls },
      })
    } catch (e) {
      logger.error(e)
      process.send({
        action: MA_BATCH_FAILED,
        payload: {
          id: batch.id,
          error: e.stack || e.toString(),
        },
      })
    }
  }

  process.send({ action: MA_ONLINE })
  process.on('message', ({ action, payload }) => {
    switch (action) {
      case MA_ADD_BATCH:
        addBatchJob(payload)
        break
    }
  })
}

const sendTx = (tx, pool, nonce = -1) =>
  new Promise((resolve, reject) => {
    let unsub
    const doUnsub = (reason) => {
      unsub?.()
      clearCurrentTimeout()
      return reject(reason)
    }
    let timeout = setTimeout(() => {
      unsub?.()
      reject(new TxTimeOutError('Timeout!'))
    }, TX_TIMEOUT)
    const clearCurrentTimeout = () => clearTimeout(timeout)

    tx.signAndSend(pool.pair, { nonce }, (result) => {
      const { status, dispatchError, events } = result
      logger.debug(
        { hash: tx.hash.toHex() },
        'Tx status changed.',
        status.toString()
      )
      try {
        if (status.isUsurped || status.isDropped || status.isInvalid) {
          return doUnsub(`Tx has unexpected status: ${status}`)
        }
        if (status.isInBlock) {
          if (dispatchError) {
            doUnsub(resolveDispatchError(dispatchError))
          } else {
            if (pool.isProxy) {
              const {
                event: {
                  data: [proxyResult],
                },
              } = events.filter(({ event }) =>
                phalaApi.events.proxy.ProxyExecuted.is(event)
              )[0]

              if (proxyResult.isErr) {
                return doUnsub(new Error(JSON.stringify(proxyResult.toJSON())))
              }
            }

            const batchFailed = !events.filter(
              ({ event }) =>
                phalaApi.events.utility.BatchCompleted.is(event) ||
                phalaApi.events.utility.BatchCompletedWithErrors.is(event)
            ).length

            if (batchFailed) {
              return doUnsub(new Error('Batch failed with no reason!'))
            }

            const failedCalls = events
              .filter(({ event }) =>
                phalaApi.events.utility.ItemFailed.is(event)
              )
              .map(
                ({
                  event: {
                    data: [index, dispatchError],
                  },
                }) => ({
                  index: index.toNumber(),
                  reason: resolveDispatchError(dispatchError),
                })
              )
            clearCurrentTimeout()
            unsub?.()
            return resolve(failedCalls)
          }
        }
      } catch (e) {
        doUnsub(e)
      }
    })
      .then((fn) => {
        unsub = fn
      })
      .catch((e) => doUnsub(e))
  })

const resolveDispatchError = (dispatchError) => {
  if (dispatchError.isModule) {
    const decoded = phalaApi.registry.findMetaError(dispatchError.asModule)
    const { documentation, name, section } = decoded

    return `${section}.${name}: ${documentation?.join(' ')}`
  } else {
    return dispatchError.toString()
  }
}

export default start

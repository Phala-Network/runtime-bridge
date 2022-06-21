import { LIFECYCLE, getMyId } from '../utils/my-id'
import { TX_SEND_QUEUE_SIZE, TX_TIMEOUT } from '../utils/constants'
import { phalaApi, setupPhalaApi } from '../utils/api'
import { setupLocalDb } from '../lifecycle/local_db'
import PQueue from 'p-queue'
import Pool from '../lifecycle/local_db/pool_model'
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
  await setupLocalDb(await getMyId(LIFECYCLE), true)
  await setupPhalaApi(env.chainEndpoint)

  const processQueue = new PQueue({ concurrency: TX_SEND_QUEUE_SIZE })
  const addQueue = new PQueue({ concurrency: 1 })

  const addBatchJob = (batch) => addQueue.add(() => doAddJob(batch))
  const doAddJob = async (batch) => {
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

  const formTx = (pool, calls) => {
    const txs = calls.map((c) =>
      c.reduce(
        (prev, curr) => (typeof curr === 'string' ? prev[curr] : prev(...curr)),
        phalaApi
      )
    )
    const batchTx = phalaApi.tx.utility.forceBatch(txs)
    return pool.isProxy
      ? phalaApi.tx.proxy.proxy(pool.proxiedAccountSs58, null, batchTx)
      : batchTx
  }

  const processBatch = async (batch) => {
    const pool = await Pool.findOne({
      where: {
        pid: parseInt(batch.pid),
      },
    })
    pool.operator.unlock()
    const tx = formTx(pool, batch.calls)
    let nonce
    try {
      if (typeof poolNonces[pool.id] === 'number') {
        nonce = (
          await phalaApi.rpc.system.accountNextIndex(pool.operator.address)
        ).toNumber()
      } else {
        nonce = poolNonces[pool.id]
      }
      poolNonces[pool.id] = nonce + 1
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
      logger.debug(
        { hash: tx.hash.toHex() },
        'Tx status changed.',
        result.status.toString()
      )
      try {
        if (
          result.status.isUsurped ||
          result.status.isDropped ||
          result.status.isInvalid
        ) {
          return doUnsub(`Tx has unexpected status: ${result.status}`)
        }
        if (result.status.isInBlock) {
          if (result.dispatchError) {
            doUnsub(resolveDispatchError(result.dispatchError))
          } else {
            const { events } = result

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

            const batchCompletedWithErrors =
              events.filter(({ event }) =>
                phalaApi.events.utility.BatchCompletedWithErrors.is(event)
              ).length > 0
            const batchCompleted = batchCompletedWithErrors
              ? true
              : events.filter(({ event }) =>
                  phalaApi.events.utility.BatchCompleted.is(event)
                ).length > 0
            const batchFailed = !batchCompleted

            if (batchFailed) {
              return doUnsub(new Error('Batch failed with no reason!'))
            }

            const failedCalls = batchCompletedWithErrors
              ? events
                  .filter(
                    ({ event }) =>
                      phalaApi.events.utility.ItemCompleted.is(event) ||
                      phalaApi.events.utility.ItemFailed.is(event)
                  )
                  .map(({ event }, idx) => {
                    event.__tradeIndex = idx
                    return event
                  })
                  .filter((event) =>
                    phalaApi.events.utility.ItemFailed.is(event)
                  )
                  .map((event) => {
                    const { error } = phalaApi.createType(
                      'WrappedDispatchError',
                      event.data
                    )
                    return {
                      index: event.__tradeIndex,
                      reason: resolveDispatchError(error),
                    }
                  })
              : []
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
    const { docs, name, section } = decoded

    return `${section}.${name}: ${docs?.join(' ')}`
  } else {
    return dispatchError.toString()
  }
}

export default start

import {
  APP_MESSAGE_QUEUE_NAME,
  TX_SEND_QUEUE_SIZE,
  TX_SUB_QUEUE_SIZE,
} from '../utils/constants'
import { getPool } from '../lifecycle/worker'
import { phalaApi } from '../utils/api'
import BeeQueue from 'bee-queue'
import logger from '../utils/logger'
import wait from '../utils/wait'

const createSubQueue = ({ redisUrl, pid, actions, txQueue, context }) => {
  const queueName = `${APP_MESSAGE_QUEUE_NAME}__${pid}`
  const ret = new BeeQueue(queueName, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(queueName, job)
  }

  ret.shouldStop = false

  const sendQueue = []

  ret.process(TX_SUB_QUEUE_SIZE, async (job) => {
    $logger.info(`Pool #${pid}: Processing job #${job.id}...`)

    const pool = await getPool(pid, context, true)

    const actionFn = actions[job.data.action]

    return await actionFn(job.data.payload, {
      txQueue,
      pool,
      operator: pool.pair,
      context,
      sendQueue,
    })
  })

  const processSendQueue = async (_nextNonce) => {
    if (ret.shouldStop) {
      return
    }

    if (!sendQueue.length) {
      await wait(6000)
      return await processSendQueue(_nextNonce)
    }

    const currentJobs = []
    let whileCount = 0
    while (
      whileCount < sendQueue.length &&
      currentJobs.length < TX_SEND_QUEUE_SIZE
    ) {
      currentJobs.push(sendQueue.shift())
      whileCount += 1
    }

    const nextNonce = await sendBatchedTransactions(currentJobs, _nextNonce)
    return await processSendQueue(nextNonce)
  }

  ret.sendQueuePromise = processSendQueue()

  return ret
}

const createTradeQueue = (redisUrl) => {
  const queueName = `${APP_MESSAGE_QUEUE_NAME}__main`
  const ret = new BeeQueue(queueName, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(queueName, job)
  }

  return ret
}

const waitForJob = (queueName, job) =>
  new Promise((resolve, reject) => {
    job
      .save()
      .then(() => {
        job.on('succeeded', (result) => {
          resolve(result)
        })
        job.on('retrying', (err) => {
          $logger.warn(
            { queueName },
            err,
            `Job #${job.id} failed with error ${err.message} but is being retried!`
          )
        })
        job.on('failed', (err) => {
          $logger.warn(
            { queueName },
            err,
            `Job #${job.id} failed with error ${err.message}.`
          )
          reject(err)
        })
      })
      .catch(reject)
  })

const sendBatchedTransactions = async (currentJobs, nextNonce) => {
  const operator = currentJobs[0].options.operator

  let nonce =
    nextNonce ||
    (
      await phalaApi.rpc.system.accountNextIndex(
        currentJobs[0].options.pool.ss58Phala
      )
    ).toNumber()
  logger.info('sendBatchedTransactions: accountNextIndex = ' + nonce)

  for (const { makeTx, resolve, reject } of currentJobs) {
    try {
      const txs = makeTx()
      const promises = []
      for (const tx of txs) {
        promises.push(sendTx(tx, operator, { nonce }))
        nonce += 1
      }
      Promise.all(promises).then(resolve).catch(reject)
    } catch (e) {
      reject(e)
    }
  }
  return nonce
}

const sendTx = (tx, sender, options) =>
  new Promise((resolve, reject) => {
    logger.debug(
      { nonce: options.nonce, hash: tx.hash.toHex() },
      'Start sending tx...'
    )
    tx.signAndSend(sender, options, (result) => {
      const { status, dispatchError } = result
      logger.debug(
        { nonce: options.nonce },
        'Tx status changed.',
        status.toString()
      )

      try {
        if (status.isUsurped || status.isDropped || status.isInvalid) {
          return reject(`${status}`)
        }
        if (status.isInBlock) {
          if (dispatchError) {
            if (dispatchError.isModule) {
              const decoded = phalaApi.registry.findMetaError(
                dispatchError.asModule
              )
              const { documentation, name, section } = decoded

              return reject(
                new Error(`${section}.${name}: ${documentation?.join(' ')}`)
              )
            } else {
              return reject(new Error(dispatchError.toString()))
            }
          } else {
            return resolve(`${status}`)
          }
        }
      } catch (e) {
        reject(e)
      }
    }).catch(reject)
  })

export default createTradeQueue
export { waitForJob, createSubQueue, createTradeQueue }

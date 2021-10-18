import {
  TX_BATCH_COMMIT_TIMEOUT,
  TX_BATCH_DEQUEUE_TIMEOUT,
  TX_BATCH_SIZE,
  TX_QUEUE_SIZE,
} from '../utils/constants'
import { preprocess } from './preprocess'
import { setupPhalaApi } from '../utils/api'
import { traderManager } from './trader_manager'
import { v4 as uuid } from 'uuid'
import createTradeQueue from './trade_queue'
import env from '../utils/env'
import logger from '../utils/logger'
import wait from '../utils/wait'

export const RP_INIT = 'RP_INIT'
export const RP_PREPROCESSED = 'RP_PREPROCESSED'
export const RP_SHOULD_RETRY = 'RP_SHOULD_RETRY'
export const RP_WORKING = 'RP_WORKING'
export const RP_FAILED = 'RP_FAILED'
export const RP_FINISHED = 'RP_FINISHED'

const messageBus = {
  queuesPerPool: {},
}

class PoolQueue {
  #pid
  #queue = []
  // #aliveBatches = {}
  #currentBatch = null

  constructor(pid) {
    this.#pid = pid
    this.#dequeueLoop()
  }

  addJob(job) {
    const batch = this.#findBatch()
    batch.addCalls(job)
    return batch
  }

  #findBatch() {
    if (!this.#currentBatch) {
      return this.#createBatch()
    }
    if (this.#currentBatch.calls.length > TX_BATCH_SIZE) {
      this.#currentBatch.commit()
      return this.#createBatch()
    }

    return this.#currentBatch
  }

  #createBatch() {
    let commitTimeout
    const batchId = uuid()
    const calls = []
    const callToJobId = {}
    const jobs = []

    let startedPromise__resolve, startedPromise__reject
    const startedPromise = new Promise((resolve, reject) => {
      startedPromise__resolve = resolve
      startedPromise__reject = reject
    })

    let finishedPromise__resolve, finishedPromise__reject
    const finishedPromise = new Promise((resolve, reject) => {
      finishedPromise__resolve = resolve
      finishedPromise__reject = reject
    })

    const updateCommitTimeout = () => {
      if (commitTimeout) {
        clearTimeout(commitTimeout)
      }
      commitTimeout = setTimeout(() => commit(), TX_BATCH_COMMIT_TIMEOUT)
    }

    const wrapError = (fn) => {
      return (...args) => {
        try {
          return fn(...args)
        } catch (e) {
          clearTimeout(commitTimeout)
          throw e
        }
      }
    }

    const addCalls = wrapError((job) => {
      updateCommitTimeout()
      const currentLength = calls.length
      job.calls.forEach((call, idx) => {
        callToJobId[currentLength + idx] = call.id
        calls.push(call)
      })
      jobs.push(job)
    })
    const commit = wrapError(() => {
      clearTimeout(commitTimeout)
      this.#currentBatch = null
      this.#queue.push(batchRef)
    })

    const batchRef = {
      id: batchId,
      jobs,
      callToJobId,
      batchId,
      calls,
      addCalls,
      commit,
      startedPromise,
      startedPromise__resolve,
      startedPromise__reject,
      finishedPromise__resolve,
      finishedPromise__reject,
      finishedPromise,
    }

    return batchRef
  }

  get pid() {
    return this.#pid
  }

  get queue() {
    return this.#queue
  }

  async #dequeue() {
    const item = this.#queue.shift()
    if (typeof item === 'undefined') {
      return true
    }
    await traderManager.addBatchJob(item)
    return false
  }

  async #dequeueLoop() {
    try {
      const isEmpty = await this.#dequeue()
      if (isEmpty) {
        await wait(TX_BATCH_DEQUEUE_TIMEOUT)
      }
      return this.#dequeueLoop()
    } catch (e) {
      logger.error(e)
      return this.#dequeueLoop()
    }
  }

  get currentBatch() {
    return this.#currentBatch
  }
}

const getPoolQueue = (pid) => {
  const pidStr = `${pid}`
  let queue = messageBus.queuesPerPool[pidStr]
  if (queue) {
    return queue
  }
  queue = new PoolQueue(pidStr)
  messageBus.queuesPerPool[pidStr] = queue
  return queue
}

const startMessageBus = async (appContext) => {
  await setupPhalaApi(env.chainEndpoint)
  await appContext.traderManager.waitUntilUp()
  Object.assign(messageBus, { appContext })

  const inputQueue = createTradeQueue(env.qRedisEndpoint)
  await inputQueue.ready()

  logger.info('Now accepting incoming transaction requests...')

  const callRefs = {}

  const enqueue = async (callMeta) => {
    const poolQueue = getPoolQueue(callMeta.pid)
    const batch = poolQueue.addJob(callMeta)
    callRefs[callMeta.id] = batch
    await batch.startedPromise
    return async () => {
      try {
        const { indexes, reasons } = await batch.finishedPromise
        const reasonId = indexes.indexOf(callMeta.id)
        if (reasonId > -1) {
          throw new Error(`Chain-side failed: ${reasons[reasonId].message}`)
        }
      } catch (e) {
        logger.error(`Job #{callMeta.id} failed:`, e)
        throw e
      } finally {
        if (callRefs[callMeta.id]) {
          delete callRefs[callMeta.id]
        }
      }
    }
  }

  inputQueue.process(TX_QUEUE_SIZE, async (job) => {
    await job.reportProgress(RP_INIT)
    const callMeta = await preprocess(job)
    await job.reportProgress(RP_PREPROCESSED)
    let remainingRetries = callMeta.shouldRetry ? 3 : 0

    const processJob = async () => {
      const waitUntilFinished = await enqueue(callMeta)
      await job.reportProgress(RP_WORKING)
      await waitUntilFinished()
      await job.reportProgress(RP_FINISHED)
    }
    const rescueJob = (e) => {
      if (!remainingRetries) {
        job.reportProgress(RP_FAILED)
        throw e
      }
      job.reportProgress(RP_SHOULD_RETRY)
      remainingRetries -= 1
      logger.warn(`Retrying job #${job.id} with error:`, e)
      return processJob().catch(rescueJob)
    }
    await processJob().catch(rescueJob)
  })

  Object.assign(appContext, { messageBus })
}

export default startMessageBus
export { messageBus }

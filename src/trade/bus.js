import { TX_QUEUE_SIZE } from '../utils/constants'
import { preprocess } from './preprocess'
import { setupPhalaApi } from '../utils/api'
import createTradeQueue from './trade_queue'
import env from '../utils/env'
import logger from '../utils/logger'

export const RP_INIT = 'RP_INIT'
export const RP_PREPROCESSED = 'RP_PREPROCESSED'
export const RP_SHOULD_RETRY = 'RP_SHOULD_RETRY'
export const RP_WORKING = 'RP_WORKING'
export const RP_FAILED = 'RP_FAILED'
export const RP_FINISHED = 'RP_FINISHED'

const messageBus = {
  queuesPerPool: {},
}

const getQueue = (pid) => {
  const pidStr = `${pid}`
  let queue = messageBus.queuesPerPool[pidStr]
  if (queue) {
    return queue
  }
  queue = createPoolQueue(pidStr)
  messageBus.queuesPerPool[pidStr] = queue
  return queue
}

const createPoolQueue = (pid) => {
  const queue = []
  return {
    pid,
    queue,
  }
}

const startMessageBus = async (appContext) => {
  await setupPhalaApi(env.chainEndpoint)
  await appContext.traderManager.waitUntilUp()
  Object.assign(messageBus, { appContext })

  const inputQueue = createTradeQueue(env.qRedisEndpoint)
  await inputQueue.ready()

  logger.info('Now accepting incoming transaction requests...')

  const enqueue = async (callMeta) => {
    throw new Error('todo')
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
    const rescureJob = (e) => {
      if (!remainingRetries) {
        job.reportProgress(RP_FAILED)
        throw e
      }
      job.reportProgress(RP_SHOULD_RETRY)
      remainingRetries -= 1
      logger.warn(`Retrying job #${job.id} with error:`, e)
      return processJob().catch(rescureJob)
    }
    await processJob().catch(rescureJob)
  })

  Object.assign(appContext, { messageBus })
}

export default startMessageBus
export { messageBus }

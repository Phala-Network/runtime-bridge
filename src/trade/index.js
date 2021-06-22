import { TX_QUEUE_SIZE } from '../utils/constants'
import { setupPhalaApi } from '../utils/api'
import createKeyring from '../utils/keyring'
import createTradeQueue, { createSubQueue } from '../utils/trade_queue'
import env from '../utils/env'
import * as actions from './actions'
import logger from '../utils/logger'

const start = async () => {
  await setupPhalaApi(env.chainEndpoint)
  const keyring = await createKeyring()
  const txQueue = createTradeQueue(env.redisEndpoint)
  const subQueues = new Map()

  await txQueue.ready()

  const context = {
    keyring,
    txQueue,
    subQueues,
  }

  txQueue.process(TX_QUEUE_SIZE, async (job) => {
    $logger.info(job.data, `Processing job #${job.id}...`)

    const { worker } = job.data.payload

    let subQueue = subQueues.get(worker.id)
    if (!subQueue) {
      subQueue = createSubQueue({
        redisUrl: env.redisEndpoint,
        worker,
        actions,
        txQueue,
        keyring,
        context,
      })
      subQueues.set(worker.id, subQueue)
    }

    try {
      const ret = await subQueue.dispatch(job.data)
      $logger.info(`Job #${job.id} finished.`)
      return ret
    } catch (e) {
      $logger.warn(e, `Job #${job.id} failed with error.`)
      throw e
    }
  })
  logger.info('Now accepting incoming transaction requests...')

  return
}

export default start

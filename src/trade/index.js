import { DB_WORKER, setupDb } from '../io/db'
import { TX_QUEUE_SIZE } from '../utils/constants'
import { setupPhalaApi } from '../utils/api'
import createTradeQueue, { createSubQueue } from './trade_queue'
import env from '../utils/env'
import logger from '../utils/logger'
import * as actions from './actions'

const start = async () => {
  await setupDb(DB_WORKER)
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.redisEndpoint)
  const subQueues = new Map()
  const pools = new Map()

  await txQueue.ready()

  const context = {
    txQueue,
    subQueues,
    pools,
  }

  txQueue.process(TX_QUEUE_SIZE, async (job) => {
    $logger.info({ action: job.data.action }, `Processing job #${job.id}...`)

    const { pid } = job.data.payload

    let subQueue = subQueues.get(pid)
    if (!subQueue) {
      subQueue = createSubQueue({
        redisUrl: env.redisEndpoint,
        pid,
        actions,
        txQueue,
        context,
      })
      subQueues.set(pid, subQueue)
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
}

export default start

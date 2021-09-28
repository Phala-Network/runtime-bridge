import { DB_WORKER, setupDb } from '../io/db'
import { TX_QUEUE_SIZE } from '../utils/constants'
import { getPool } from '../lifecycle/worker'
import { setupPhalaApi } from '../utils/api'
import createTradeQueue, { createSubQueue } from './trade_queue'
import env from '../utils/env'
import logger from '../utils/logger'
import * as actions from './actions'

const start = async () => {
  await setupDb(DB_WORKER)
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.qRedisEndpoint)
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
    let pool = pools.get(pid)
    if (!pool) {
      pool = await getPool(pid, context)
    }

    let subQueue = subQueues.get(pool.ss58Phala)
    if (!subQueue) {
      subQueue = createSubQueue({
        redisUrl: env.qRedisEndpoint,
        sender: pool.ss58Phala,
        actions,
        txQueue,
        context,
      })
      subQueues.set(pool.ss58Phala, subQueue)
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

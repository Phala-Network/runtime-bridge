import createRedisClient from '@/utils/redis'
import Machine from '@/models/machine'
import createMessageQueue from '@/utils/mq'
import * as actions from './actions'

const start = async ({ redisEndpoint, messageRedisEndpoint, criticalRedisEndpoint }) => {
  const redis = await createRedisClient(redisEndpoint, true)
  const criticalRedis = await createRedisClient(criticalRedisEndpoint, false)
  Machine.prototype.client = criticalRedis
  const mq = createMessageQueue(messageRedisEndpoint)
  await mq.ready()
  $logger.info('Waiting for messages...')

  mq.process(async job => {
    $logger.info(job.data, `Processing job #${job.id}...`, )
    const actionFn = actions[job.data.action]

    try {
      const ret = await actionFn(job.data.payload, {
        redis,
        criticalRedis,
        mq,
        Machine
      })
      $logger.info(`Job #${job.id} finished.`)
      return ret
    } catch (e) {
      $logger.warn(e, `Job #${job.id} failed with error.`)
      throw e
    }
  })
}

export default start

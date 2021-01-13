import createRedisClient from '@/utils/redis'
import createMessageQueue from '@/utils/mq'

const start = async ({ redisEndpoint, messageRedisEndpoint, identity }) => {
  const redis = await createRedisClient(redisEndpoint, true)
  const mq = createMessageQueue(messageRedisEndpoint)
  await mq.ready()

  $logger.info(`Requesting initial information with identity: ${identity}.`)
  const initRuntimePayload = await mq.dispatch({
    action: 'REQUEST_INIT_RUNTIME',
    payload: { identity }
  })
  $logger.info(initRuntimePayload, `Got initial information.`)
  process.exit(0)
}

export default start

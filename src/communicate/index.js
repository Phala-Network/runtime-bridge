import createRedisClient from '@/utils/redis'
import createMessageQueue from '@/utils/mq'
import PRuntime from './pruntime'

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
  const { recordId, runtimeEndpoint, phalaSs58Address } = initRuntimePayload
  const pRuntime = new PRuntime({ runtimeEndpoint, machineRecordId: recordId, redis, mq, phalaSs58Address })

  return pRuntime.startLifecycle()
}

export default start

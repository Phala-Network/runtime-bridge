import { start as startOttoman } from '@/utils/couchbase'
import createMessageQueue, { proto } from '@/message'

const _p = proto

const start = async ({ redisEndpoint, couchbaseEndpoint }) => {
  await startOttoman(couchbaseEndpoint)
  const redis = await createRedisClient(redisEndpoint, true)
  const mq = createMessageQueue(redisEndpoint)
  await mq.ready()

  // $logger.info(`Requesting initial information with identity: ${identity}.`)
  // const initRuntimePayload = await mq.dispatch({
  //   action: 'REQUEST_INIT_RUNTIME',
  //   payload: { identity }
  // })
  // $logger.info(initRuntimePayload, `Got initial information.`)
  // const { recordId, runtimeEndpoint, phalaSs58Address } = initRuntimePayload
  // const pRuntime = new PRuntime({ runtimeEndpoint, machineRecordId: recordId, redis, mq, phalaSs58Address })

  // return pRuntime.startLifecycle()
}

export default start

import createRedisClient from '@/utils/redis'
import { createModel as createMachineModel } from '@/models/machine'

const start = async ({ redisEndpoint, messageRedisEndpoint, criticalRedisEndpoint }) => {
  const redis = await createRedisClient(redisEndpoint, true)
  const messageRedis = await createRedisClient(messageRedisEndpoint, false)
  const criticalRedis = await createRedisClient(criticalRedisEndpoint, false)

  const Machine = await createMachineModel(criticalRedis)

  // const test = new Machine()
  await criticalRedis.set('test', 1)
  console.log(test)

}

export default start

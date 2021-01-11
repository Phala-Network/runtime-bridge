import createRedisClient from '@/utils/redis'
import { createModel as createMachineModel } from '@/models/machine'
import { Nohm } from 'nohm'

const start = async ({ redisEndpoint, messageRedisEndpoint, criticalRedisEndpoint }) => {
  const redis = createRedisClient(redisEndpoint, true)
  const messageRedis = createRedisClient(messageRedisEndpoint, false)
  const criticalRedis = createRedisClient(criticalRedisEndpoint, false)

  const Machine = await createMachineModel(criticalRedis)

  // const test = new Machine()
  await criticalRedis.set('test', 1)
  console.log(test)

}

export default start

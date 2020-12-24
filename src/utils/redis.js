import { Nohm } from 'nohm'
import promiseRedis from 'promise-redis'
const redis = promiseRedis()

const createClient = redisEndpoint => {
  const client = redis.createClient(redisEndpoint)

  client.on('connect', () => {
    Nohm.setClient(client)
    Nohm.setPrefix('PhalaRuntimeBridge')
  })

  return client
}

export default createClient

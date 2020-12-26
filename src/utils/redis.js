import { Nohm } from 'nohm'
import promiseRedis from 'promise-redis'
const redis = promiseRedis()

const createClient = (redisEndpoint, options = {}) => {
  const client = redis.createClient({
    url: redisEndpoint,
    ...options
  })

  client.on('connect', () => {
    Nohm.setClient(client)
    Nohm.setPrefix('PhalaRuntimeBridge')
  })

  return client
}

export const bufferType = (value, key, old) => {
  console.log(key)
  // console.log(value)
  return value
}

export default createClient

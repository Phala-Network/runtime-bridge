import { Nohm } from 'nohm'
import promiseRedis from 'promise-redis'
import { list as redisCommands } from 'redis-commands'
import pQueue from 'p-queue'
const { default: Queue } = pQueue

const redis = promiseRedis()

const createClient = (redisEndpoint, options = {}) => {
  const queue = new Queue({
    timeout: 3000,
    throwOnTimeout: true
  })

  const client = redis.createClient({
    url: redisEndpoint,
    ...options
  })
  const proto = redis.RedisClient.prototype

  redisCommands.forEach(i => {
    const command = i.split(' ')[0]

    if (command !== 'multi') {
      const func = proto[i]
      const _func = (...args) => queue.add(() => func.apply(client, args))

      proto[i] = function (...args) {
        if (typeof args[args.length - 1] === 'function') {
          return func.apply(client, args)
        } else {
          return _func(...args)
            .catch(e => {
              if (e?.name === 'TimeoutError') {
                return _func(...args)
              }
              throw e
            })
        }
      }
    }
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

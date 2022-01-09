import { list } from 'redis-commands'
import PQueue from 'p-queue'
import Redis from 'ioredis'

import logger from './logger'

const ignoreCommands = ['multi', 'pipeline', 'scanStream']

export const createClient = (redisEndpoint, options = {}) =>
  new Promise((resolve) => {
    const queue = new PQueue({
      timeout: 3000,
      throwOnTimeout: true,
    })

    const client = new Redis(redisEndpoint, options)

    list.forEach((i) => {
      const command = i.split(' ')[0]

      if (ignoreCommands.indexOf(command) > -1) {
        const func = client[i]
        const _func = (...args) => queue.add(() => func.apply(client, args))

        client[i.toUpperCase()] = client[i]
        client[i] = function (...args) {
          if (typeof args[args.length - 1] === 'function') {
            return func.apply(client, args)
          } else {
            return _func(...args).catch((e) => {
              if (e && e.name === 'TimeoutError') {
                return _func(...args)
              }
              throw e
            })
          }
        }
      }
    })

    client.put = client.set

    client.on('ready', () => {
      resolve(client)
    })

    client.on('error', (e) => {
      logger.error('REDIS ERROR!', e)
    })
  })

export default createClient

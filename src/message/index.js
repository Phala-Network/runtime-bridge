import BeeQueue from 'bee-queue'
import createRedisClient from '@/utils/redis'
import { APP_MESSAGE_QUEUE_NAME } from '@/utils/constants'
import { Message } from './proto'

const createMessageQueue = redisUrl => {
  const ret = new BeeQueue(APP_MESSAGE_QUEUE_NAME, {
    redis: {
      url: redisUrl
    }
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(job)
  }

  return ret
}

const waitForJob = async (job) => {
  const ret = new Promise((resolve, reject) => {
    job.on('succeeded', result => {
      resolve(result)
    })
    job.on('retrying', err => {
      $logger.warn(err, `Job #${job.id} failed with error ${err.message} but is being retried!`)
    })
    job.on('failed', err => {
      $logger.warn(err, `Job #${job.id} failed with error ${err.message}.`)
      reject(err)
    })
  })

  await job.save()

  return ret
}

const createMessageTunnel = async (redisEndpoint, from) => {
  const pubClient = await createRedisClient(redisEndpoint)
  const subClient = await createRedisClient(redisEndpoint)

  const publish = async ({ to = 0, content, nonceRef = 0, type = 0, ...rest }) => {
    const nonce = Math.random * 1000000000

    const data = Message.encode(new Message({
      from,
      to,
      createdAt,
      nonce,
      nonceRef,
      type,
      content: rest
    }))

    await pubClient.publish(APP_MESSAGE_QUEUE_NAME, data)
    return nonce
  }
  const subscribe = handler => {}

  return {
    publish,
    subscribe,
    pubClient,
    subClient
  }
}

export {
  waitForJob,
  createMessageTunnel,
  createMessageQueue
}

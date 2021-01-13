import BeeQueue from 'bee-queue'
import { APP_MESSAGE_QUEUE_NAME } from '@/utils/constants'

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

export default createMessageQueue
export { waitForJob }

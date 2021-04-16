import BeeQueue from 'bee-queue'
import { APP_MESSAGE_QUEUE_NAME } from '@/utils/constants'

const createTradeQueue = (redisUrl) => {
  const ret = new BeeQueue(APP_MESSAGE_QUEUE_NAME, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(job)
  }

  return ret
}

const waitForJob = (job) =>
  new Promise((resolve, reject) => {
    job
      .save()
      .then(() => {
        job.on('succeeded', (result) => {
          resolve(result)
        })
        job.on('retrying', (err) => {
          $logger.warn(
            err,
            `Job #${job.id} failed with error ${err.message} but is being retried!`
          )
        })
        job.on('failed', (err) => {
          $logger.warn(err, `Job #${job.id} failed with error ${err.message}.`)
          reject(err)
        })
      })
      .catch(reject)
  })

export default createTradeQueue
export { waitForJob }

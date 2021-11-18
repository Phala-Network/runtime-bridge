import { APP_MESSAGE_QUEUE_NAME } from '../utils/constants'
import BeeQueue from 'bee-queue'
import logger from '../utils/logger'

export class TxTimeOutError extends Error {}

const createTradeQueue = (redisUrl) => {
  const queueName = `${APP_MESSAGE_QUEUE_NAME}__main`
  const ret = new BeeQueue(queueName, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(queueName, job, ret)
  }

  return ret
}

const waitForJob = (queueName, job, queue) =>
  new Promise((resolve, reject) => {
    job
      .save()
      .then(() => {
        job.on('succeeded', (result) => {
          resolve(result)
        })
        job.on('retrying', (err) => {
          logger.warn(
            { queueName },
            err,
            `Job #${job.id} failed with error ${err.message} but is being retried!`
          )
        })
        job.on('failed', (err) => {
          if (err.message?.length) {
            reject(err)
          } else {
            queue.getJob(job.id).then((j) => {
              let stack = j?.options?.stacktraces
              if (typeof stack !== 'string') {
                if (Array.isArray(stack)) {
                  stack = stack.join('')
                } else {
                  stack = JSON.stringify(stack, null, 2)
                }
              }
              logger.warn(
                { queueName },
                `Job #${job.id} failed with error: ${stack}.`
              )
              reject(stack)
            })
          }
        })
      })
      .catch(reject)
  })

export default createTradeQueue
export { waitForJob, createTradeQueue }

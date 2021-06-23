import { APP_MESSAGE_QUEUE_NAME } from './constants'
import { phalaApi } from './api'
import BeeQueue from 'bee-queue'

const createSubQueue = ({
  redisUrl,
  worker,
  actions,
  txQueue,
  keyring,
  context,
}) => {
  const queueName = `${APP_MESSAGE_QUEUE_NAME}__${worker.id}`
  const ret = new BeeQueue(queueName, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(queueName, job)
  }

  console.log(worker)
  ret.process(1, async (job) => {
    $logger.info(job.data, `${worker.id}: Processing job #${job.id}...`)

    const actionFn = actions[job.data.action]

    return actionFn(job.data.payload, {
      txQueue,
      keyring,
      api: phalaApi,
      context,
    })
  })

  return ret
}

const createTradeQueue = (redisUrl) => {
  const queueName = `${APP_MESSAGE_QUEUE_NAME}__main`
  const ret = new BeeQueue(queueName, {
    redis: {
      url: redisUrl,
    },
  })

  ret.dispatch = (...args) => {
    const job = ret.createJob(...args)
    return waitForJob(queueName, job)
  }

  return ret
}

const waitForJob = (queueName, job) =>
  new Promise((resolve, reject) => {
    job
      .save()
      .then(() => {
        job.on('succeeded', (result) => {
          resolve(result)
        })
        job.on('retrying', (err) => {
          $logger.warn(
            { queueName },
            err,
            `Job #${job.id} failed with error ${err.message} but is being retried!`
          )
        })
        job.on('failed', (err) => {
          $logger.warn(
            { queueName },
            err,
            `Job #${job.id} failed with error ${err.message}.`
          )
          reject(err)
        })
      })
      .catch(reject)
  })

export default createTradeQueue
export { waitForJob, createSubQueue, createTradeQueue }

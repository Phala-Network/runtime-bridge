import { DB_WORKER, setupDb } from '../io/db'
import { TX_DEAD_COUNT_THRESHOLD, TX_SEND_QUEUE_SIZE } from '../utils/constants'
import { setupPhalaApi } from '../utils/api'
import PQueue from 'p-queue'
import env from '../utils/env'

export const MA_ONLINE = 'MA_ONLINE'
export const MA_ERROR = 'MA_ERROR'
export const MA_ADD_BATCH = 'MA_ADD_BATCH'
export const MA_BATCH_ADDED = 'MA_BATCH_ADDED'
export const MA_BATCH_REJECTED = 'MA_BATCH_REJECTED'
export const MA_BATCH_WORKING = 'MA_BATCH_WORKING'
export const MA_BATCH_FINISHED = 'MA_BATCH_FINISHED'
export const MA_BATCH_FAILED = 'MA_BATCH_FINISHED'

const start = async () => {
  await setupDb(DB_WORKER)
  await setupPhalaApi(env.chainEndpoint)

  let deadCount = 0

  const processQueue = new PQueue({ concurrency: TX_SEND_QUEUE_SIZE })
  const addQueue = new PQueue({ concurrency: 1 })

  const addBatchJob = (batch) => addQueue.add(() => doAddJob(batch))
  const doAddJob = async (batch) => {
    if (deadCount > TX_DEAD_COUNT_THRESHOLD) {
      return rejectJob(batch)
    }
    deadCount += 1
    process.send({
      action: MA_BATCH_ADDED,
      payload: {
        id: batch.id,
      },
    })
    return processQueue.add(() => processBatch(batch))
  }
  const rejectJob = async (batch) => {
    await processQueue.onIdle()
    process.send({
      action: MA_BATCH_REJECTED,
      payload: {
        id: batch.id,
      },
    })
  }
  const processBatch = async (batch) => {
    // TODO
  }

  process.send({ action: MA_ONLINE })
  process.on('message', ({ action, payload }) => {
    switch (action) {
      case MA_ADD_BATCH:
        addBatchJob(payload)
        break
    }
  })
}

export default start

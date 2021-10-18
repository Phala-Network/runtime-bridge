import { DB_WORKER, setupDb } from '../io/db'
import { setupPhalaApi } from '../utils/api'
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
  process.send({ action: MA_ONLINE })
  process.on('message', ({ action, payload }) => {
    switch (action) {
      case MA_ADD_BATCH:
        break
    }
  })
}

export default start

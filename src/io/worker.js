import { DB_ENCODING_DEFAULT } from './db_encoding'
import { DB_WORKER, getDb } from './db'
import levelErrors from 'level-errors'

const PREFIX_WORKER = 'worker:'

export const setWorker = async (workerId, worker) =>
  getDb(DB_WORKER).put(`${PREFIX_WORKER}${workerId}`, worker, {
    ...DB_ENCODING_DEFAULT,
  })

export const getWorker = async (workerId) => {
  const db = getDb(DB_WORKER)
  try {
    return db.get(`${PREFIX_WORKER}${workerId}`, {
      ...DB_ENCODING_DEFAULT,
    })
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

export const getAllWorker = () =>
  new Promise((resolve, reject) => {
    const db = getDb(DB_WORKER)
    const stream = db.createKeyStream({
      gte: PREFIX_WORKER,
      lte: PREFIX_WORKER + '~',
    })
    const ret = []
    stream.on('data', async (key) =>
      ret.push(
        await db.get(key, {
          ...DB_ENCODING_DEFAULT,
        })
      )
    )
    stream.on('end', () => resolve(ret))
    stream.on('error', reject)
  })

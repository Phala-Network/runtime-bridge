import { DB_ENCODING_DEFAULT } from './db_encoding'
import { DB_WORKER, getDb } from './db'
import levelErrors from 'level-errors'
import logger from '../utils/logger'

const PREFIX_WORKER = 'worker:id:'
const PREFIX_WORKER_BY_NICKNAME = 'worker:by:nickname:'
const PREFIX_WORKER_BY_SS58 = 'worker:by:phalaSs58Address:'
const PREFIX_WORKER_BY_ENDPOINT = 'worker:by:runtimeEndpoint:'

export const ERROR_BAD_INPUT = new Error('ERROR_BAD_INPUT')
export const ERROR_DUPLICATED_ID = new Error('ERROR_DUPLICATED_ID')
export const ERROR_DUPLICATED_NICKNAME = new Error('ERROR_DUPLICATED_NICKNAME')
export const ERROR_DUPLICATED_SS58 = new Error('ERROR_DUPLICATED_SS58')
export const ERROR_DUPLICATED_ENDPOINT = new Error('ERROR_DUPLICATED_ENDPOINT')

export const _getItem = (key, defaultValue = null) => {
  const db = getDb(DB_WORKER)
  return db.get(key).catch((e) => {
    if (e instanceof levelErrors.NotFoundError) {
      return defaultValue
    }
    throw e
  })
}

const logAndThrow = (worker, error) => {
  logger.error(worker, error)
  throw error
}

export const validateWorkerInput = async (worker) => {
  const { id, nickname, runtimeEndpoint, phalaSs58Address } = worker
  const _worker = {
    id,
    nickname,
    runtimeEndpoint,
    phalaSs58Address,
  }

  if (!(id.length > 0 && id.length < 48)) {
    return logAndThrow(_worker, ERROR_BAD_INPUT)
  }
  if (!(runtimeEndpoint.length > 0)) {
    return logAndThrow(_worker, ERROR_BAD_INPUT)
  }
  if (!(phalaSs58Address.length > 0)) {
    return logAndThrow(_worker, ERROR_BAD_INPUT)
  }

  if (nickname) {
    if (
      await getWorker(await _getItem(`${PREFIX_WORKER_BY_NICKNAME}${nickname}`))
    ) {
      return logAndThrow(_worker, ERROR_DUPLICATED_NICKNAME)
    }
  }
  if (
    await getWorker(
      await _getItem(`${PREFIX_WORKER_BY_SS58}${phalaSs58Address}`)
    )
  ) {
    return logAndThrow(_worker, ERROR_DUPLICATED_SS58)
  }
  if (
    await getWorker(
      await _getItem(`${PREFIX_WORKER_BY_ENDPOINT}${runtimeEndpoint}`)
    )
  ) {
    return logAndThrow(_worker, ERROR_DUPLICATED_ENDPOINT)
  }
  if (await getWorker(id)) {
    return logAndThrow(_worker, ERROR_DUPLICATED_ID)
  }

  return true
}

export const setWorker = async (worker) => {
  const db = getDb(DB_WORKER)
  const { id, nickname, runtimeEndpoint, phalaSs58Address } = worker
  await db.put(`${PREFIX_WORKER}${id}`, worker)
  await db.put(`${PREFIX_WORKER_BY_SS58}${phalaSs58Address}`, id)
  await db.put(`${PREFIX_WORKER_BY_ENDPOINT}${runtimeEndpoint}`, id)
  if (nickname) {
    await db.put(`${PREFIX_WORKER_BY_NICKNAME}${nickname}`, id)
  }

  return worker
}

export const getWorker = (workerId) => {
  const db = getDb(DB_WORKER)
  return db
    .get(`${PREFIX_WORKER}${workerId}`, {
      ...DB_ENCODING_DEFAULT,
    })
    .catch((error) => {
      if (error instanceof levelErrors.NotFoundError) {
        return null
      }
      throw error
    })
}

export const getAllWorker = () =>
  new Promise((resolve, reject) => {
    const db = getDb(DB_WORKER)
    const stream = db.createKeyStream({
      gte: PREFIX_WORKER,
      lte: PREFIX_WORKER + '~',
    })
    const ret = []
    stream.on('data', async (key) => {
      ret.push(
        db.get(key, {
          ...DB_ENCODING_DEFAULT,
        })
      )
    })
    stream.on('end', () => resolve(Promise.all(ret)))
    stream.on('error', reject)
  })

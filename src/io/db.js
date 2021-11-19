import createClient from '../utils/redis'
import env from '../utils/env'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

const dbMap = new Map()

export const DB_TOUCHED_AT = 'DB_TOUCHED_AT'

export const DB_BLOCK = env.dbFetchNamespace ?? 'prb_fetch'
export const DB_WINDOW = env.dbFetchNamespace ?? 'prb_fetch'
export const DB_WORKER = env.dbNamespace ?? 'prb_default'

export const DB_NUMBER_FETCH = 0
export const DB_NUMBER_POOL = 1

export const DB_KEYS = Object.freeze([DB_BLOCK, DB_WORKER])
export const DB_NUMBERS = Object.freeze({
  [DB_BLOCK]: DB_NUMBER_FETCH,
  [DB_WORKER]: DB_NUMBER_POOL,
})

export const getPort = (dbNum) => (parseInt(env.dbPortBase) || 9000) + dbNum

const checkDb = async (db) => {
  let touchedAt

  try {
    touchedAt = parseInt(await db.get('DB_TOUCHED_AT'))
  } catch (error) {
    logger.error(error)
  }

  if (!(touchedAt > 0)) {
    throw new Error('DB not initialized, did IO service start correctly?')
  }

  return db
}

export const setupDb = async (...nss) => {
  const dbs = await Promise.all([...nss.map(getDb)])
  return Promise.all(dbs.map(checkDb))
}

export const getDb = async (ns) => {
  let db = dbMap.get(ns)

  if (db) {
    return db
  }

  const createOptions = {
    db: DB_NUMBERS[ns] || DB_NUMBER_POOL,
    keyPrefix: ns + ':',
  }
  const redisClient = await createClient(env.dbEndpoint, createOptions)

  await redisClient.set(DB_TOUCHED_AT, Date.now())
  logger.info(createOptions, 'Connecting DB...')

  dbMap.set(ns, redisClient)
  return redisClient
}

export const NOT_FOUND_ERROR = new Error('Not found.')

export const getKeyExistence = async (db, key) => (await db.exists(key)) === 1

const _waitFor = async (waitFn) => {
  try {
    const ret = await waitFn()
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (e) {
    if (e === NOT_FOUND_ERROR) {
      await wait(2000)
      return _waitFor(waitFn)
    }
    throw e
  }
}
export const waitFor = (waitFn) =>
  promiseRetry(
    (retry, retriedTimes) =>
      _waitFor(waitFn).catch((e) => {
        logger.error({ retriedTimes }, e)
        return retry(e)
      }),
    {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 12000,
    }
  )

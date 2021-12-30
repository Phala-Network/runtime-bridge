import createClient from '../../utils/redis'
import env from '../../utils/env'
import logger from '../../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'
import type { KeyType } from 'ioredis'
import type { PrbRedisClient } from '../../utils/redis'

const dbMap = new Map()

export const DB_TOUCHED_AT = 'DB_TOUCHED_AT'

export const DB_BLOCK = env.dbFetchNamespace ?? 'prb_fetch'
export const DB_WINDOW = env.dbFetchNamespace ?? 'prb_fetch'
export const DB_WORKER = env.dbNamespace ?? 'prb_default'

export const DB_NUMBER_FETCH = '0'
export const DB_NUMBER_POOL = '1'

export const DB_KEYS = Object.freeze([DB_BLOCK, DB_WORKER])
export const DB_NUMBERS = Object.freeze({
  [DB_BLOCK]: DB_NUMBER_FETCH,
  [DB_WINDOW]: DB_NUMBER_FETCH,
  [DB_WORKER]: DB_NUMBER_POOL,
})

const checkDb = async (db: PrbRedisClient) => {
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

export const setupDb = async (...nss: string[]) => {
  const dbs = await Promise.all([...nss.map(getDb)])
  return Promise.all(dbs.map(checkDb))
}

export const getDb = async (ns: string) => {
  const db = dbMap.get(ns)

  if (db) {
    return db
  }

  const createOptions = {
    db: parseInt(DB_NUMBERS[ns] || DB_NUMBER_POOL),
    keyPrefix: ns + ':',
  }
  const redisClient = await createClient(env.dbEndpoint, createOptions)

  await redisClient.set(DB_TOUCHED_AT, Date.now())
  logger.info(createOptions, 'Connecting DB...')

  dbMap.set(ns, redisClient)
  return redisClient
}

export const NOT_FOUND_ERROR = new Error('Not found.')

export const getKeyExistence = async (db: PrbRedisClient, key: KeyType) =>
  (await db.exists(key)) === 1

export type AnyAsyncFn<T> = (...fnArgs: unknown[]) => Promise<T> | T

const _waitFor = async <T>(waitFn: AnyAsyncFn<T>): Promise<T> => {
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
export const waitFor = <T>(waitFn: AnyAsyncFn<T>): Promise<T> =>
  promiseRetry(
    (retry, retriedTimes) =>
      _waitFor(waitFn).catch((e: unknown) => {
        logger.error({ retriedTimes }, e)
        return retry(e)
      }),
    {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 12000,
    }
  )

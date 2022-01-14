import { NotFoundError } from 'level-errors'
import { client as multileveldownClient } from 'multileveldown'
import { pipeline } from 'stream'
import cluster from 'cluster'
import env from '../../utils/env'
import fork from '../../utils/fork'
import logger from '../../utils/logger'
import net from 'net'
import path from 'path'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'
import type { KeyType } from 'ioredis'
import type { MultiLevelDownClient } from 'multileveldown'

export type PrbLevelDownClient = MultiLevelDownClient & {
  getJson?: (key: string) => ReturnType<MultiLevelDownClient['get']>
  getBuffer?: (key: string) => ReturnType<MultiLevelDownClient['get']>
  setJson?: (
    key: string,
    value: unknown
  ) => ReturnType<MultiLevelDownClient['put']>
  setBuffer?: (
    key: string,
    value: unknown
  ) => ReturnType<MultiLevelDownClient['put']>
}

let _db: MultiLevelDownClient = null

export const dbPath = env.localDbPath || '/var/data/0'
export const dbListenPath = path.join(dbPath, './conn.sock')

export const setupDb = async () => {
  if (cluster.isPrimary) {
    await forkDb()
  }
  return getDb()
}

const forkDb = (): Promise<void> =>
  new Promise((resolve) => {
    const worker = fork('rocksdb', 'data_provider/io/server')
    worker.on('message', (msg) => {
      if (msg === 'ok') {
        resolve()
      }
    })
  })

export const getDb = (): Promise<PrbLevelDownClient> => {
  if (_db) {
    return Promise.resolve(_db)
  }

  const rawDb = multileveldownClient({
    retry: true,
    keyEncoding: 'utf8',
    valueEncoding: 'binary',
  }) as PrbLevelDownClient

  const socket = net.connect(dbListenPath)
  const remote = rawDb.connect()

  const _get = rawDb.get.bind(rawDb)

  const patchedGet = async (key: unknown, options: unknown) => {
    try {
      return await _get(key, options)
    } catch (e) {
      if (e instanceof NotFoundError) {
        return null
      }
      throw e
    }
  }

  rawDb.get = patchedGet

  rawDb.getJson = (key) =>
    patchedGet(key, {
      keyEncoding: 'utf8',
      valueEncoding: 'json',
    })
  rawDb.getBuffer = (key) =>
    patchedGet(key, {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })

  rawDb.setJson = (key, value) =>
    rawDb.put(key, value, {
      keyEncoding: 'utf8',
      valueEncoding: 'json',
    })
  rawDb.setBuffer = (key, value) =>
    rawDb.put(key, value, {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })

  pipeline(socket, remote, socket, (err) => {
    logger.warn('db ipc:', err)
  })

  const connect = (): Promise<PrbLevelDownClient> =>
    new Promise((resolve) => {
      socket.on('error', (err) => {
        logger.error('db ipc connection:', err)
      })

      socket.on('close', (err) => {
        logger.error('db ipc connection:', err)
        remote.destroy()
      })

      socket.on('connect', () => {
        _db = rawDb
        logger.info(`Connected to local db.`)
        resolve(_db)
      })
    })
  return connect()
}

export const NOT_FOUND_ERROR = new Error('Not found.')

export const getKeyExistence = (
  db: MultiLevelDownClient,
  key: KeyType
): Promise<boolean> =>
  new Promise((resolve, reject) => {
    let resolved = false
    db.createKeyStream({
      limit: 1,
      gte: key,
      lte: key,
    })
      .on('data', () => {
        resolved = true
        resolve(true)
      })
      .on('error', reject)
      .on('end', () => {
        if (!resolved) {
          resolve(false)
          resolved = true
        }
      })
      .on('close', () => {
        if (!resolved) {
          resolve(false)
          resolved = true
        }
      })
  })

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

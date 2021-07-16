import { DB_ENCODING_DEFAULT, DB_ENCODING_JSON } from './db_encoding'
import { client as multileveldownClient } from 'multileveldown'
import { pipeline } from 'readable-stream'
import env from '../utils/env'
import logger from '../utils/logger'
import net from 'net'

const dbMap = new Map()

export const DB_TOUCHED_AT = 'DB_TOUCHED_AT'

export const DB_BLOCK = 0
export const DB_WINDOW = 0
export const DB_BLOB = 1
export const DB_WORKER = 1

export const DB_KEYS = Object.freeze([DB_BLOCK, DB_WORKER])

export const getPort = (dbNum) => (parseInt(env.dbPortBase) || 9000) + dbNum

const checkDb = async (db) => {
  let touchedAt

  try {
    touchedAt = await db.get('DB_TOUCHED_AT', { ...DB_ENCODING_JSON })
  } catch (error) {
    logger.error(error)
  }

  if (typeof touchedAt !== 'number') {
    logger.debug({
      'typeof touchedAt': typeof touchedAt,
      touchedAt,
    })
    throw new Error('DB not initialized, did IO service start correctly?')
  }
  return db
}

export const setupDb = async (...dbNums) => {
  const dbs = await Promise.all([...dbNums.map(getDb)])
  return Promise.all(dbs.map(checkDb))
}

export const getDb = async (dbNum) => {
  let db = dbMap.get(dbNum)

  if (db) {
    return db
  }

  const rawDb = multileveldownClient({ retry: false, ...DB_ENCODING_DEFAULT })

  const host = env.dbHost.trim() || '127.0.0.1'
  const port = getPort(dbNum)

  const socket = net.connect({ port, host })
  const remote = rawDb.connect()

  socket.setKeepAlive(true, 1000)
  pipeline(socket, remote, socket, (err) => {
    console.log(err)
  })

  const connect = () =>
    new Promise((resolve) => {
      socket.on('error', (err) => {
        logger.error({ port, host }, err)
      })

      socket.on('close', (err) => {
        logger.error({ port, host }, err)
        remote.destroy()
      })

      socket.on('connect', () => {
        db = rawDb
        dbMap.set(dbNum, db)
        logger.info(`Connected to db ${dbNum}`)
        resolve(db)
      })
    })
  return connect()
}

export const NOT_FOUND_ERROR = new Error('Not found.')

export const getKeyExistance = (db, key) =>
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

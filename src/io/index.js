import { DB_ENCODING_JSON } from './db_encoding'
import { DB_KEYS, DB_TOUCHED_AT, getPort } from './db'
import { server as multileveldownServer } from 'multileveldown'
import { pipeline } from 'readable-stream'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import env, { dbType } from '../utils/env'
import logger from '../utils/logger'
import net from 'net'
import path from 'path'

const start = async () => {
  const ports = await Promise.all(
    DB_KEYS.map(async (dbNum) => {
      const port = getPort(dbNum)
      const db = LevelUp(
        EncodingDown(dbType(path.join(env.dbPrefix, `${dbNum}`)), {
          ...DB_ENCODING_JSON,
        })
      )
      await db.put(DB_TOUCHED_AT, Date.now())
      const server = net.createServer((socket) => {
        socket.setKeepAlive(true, 1000)
        socket.on('error', (err) => {
          logger.warn({ dbNum }, 'Socket error!', err)
        })
        socket.on('close', (err) => {
          logger.debug({ dbNum }, 'Socket closed.', err)
          socket.destroy()
        })
        pipeline(socket, multileveldownServer(db), socket, (err) => {
          if (err) {
            logger.warn({ dbNum }, 'Pipeline error!', err)
          }
        })
      })
      server.listen(port, '0.0.0.0')
      return port
    })
  )

  logger.info(`IO listening to port: ${ports}`)
}

export default start

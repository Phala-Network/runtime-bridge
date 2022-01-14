import { NotFoundError } from 'level-errors'
import { blobServerSessionMaxMemory } from '../../utils/env'
import { dataProviderLocalServerPort } from '../../utils/env'
import { dbListenPath, dbPath } from './db'
import { server as multileveldownServer } from 'multileveldown'
import { pipeline } from 'stream'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import crc32 from 'crc/calculators/crc32'
import fs from 'fs/promises'
import http from 'http'
import logger from '../../utils/logger'
import net from 'net'
import rocksdb from 'rocksdb'

const setupLocalServer = (db) =>
  new Promise((resolve) => {
    const server = http.createServer()
    server.on('request', async (request, response) => {
      const key = request.headers['prb-key']
      if (!key) {
        response.writeHead(404)
        response.end('')
      } else {
        try {
          const ret = await db.get(key)
          const crc = crc32(ret).toString(16)
          response.writeHead(200, { 'prb-crc': crc })
          response.end(ret?.length ? ret : '')
        } catch (e) {
          if (!(e instanceof NotFoundError)) {
            logger.error(e)
          }
          response.writeHead(500)
          response.end('')
        }
      }
    })

    server.on('error', (err) => {
      logger.error(err)
    })

    server.listen(dataProviderLocalServerPort, () => {
      resolve()
    })
  })

const start = async () => {
  await fs.mkdir(dbPath, { recursive: true })
  try {
    await fs.unlink(dbListenPath)
  } catch (e) {
    if (e?.code !== 'ENOENT') {
      throw e
    }
  }

  const db = LevelUp(
    EncodingDown(rocksdb(dbPath), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })
  )
  await setupLocalServer(db)
  const ipcServer = net.createServer((socket) => {
    socket.on('error', (err) => {
      logger.error('Socket error!', err)
    })
    socket.on('close', (err) => {
      logger.debug('Socket closed.', err)
      socket.destroy()
    })
    pipeline(socket, multileveldownServer(db), socket, (err) => {
      if (err) {
        logger.error('Pipeline error!', err)
      }
    })
  })

  ipcServer.on('error', (err) => {
    logger.error('Socket error!', err)
  })

  ipcServer.listen(dbListenPath, () => {
    process.send('ok')
  })
}

export default start

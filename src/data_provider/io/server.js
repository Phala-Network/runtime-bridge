import { NotFoundError } from 'level-errors'
import { crc32cBuffer } from '../../utils/crc'
import { dataProviderLocalServerPort, isDev } from '../../utils/env'
import { dbListenPath, dbPath } from './db'
import { server as multileveldownServer } from 'multileveldown'
import { pipeline } from 'stream'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import fs from 'fs/promises'
import logger from '../../utils/logger'
import net from 'net'
import rocksdb from 'rocksdb'

const setupLocalServer = (db) =>
  new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('error', (err) => {
        logger.error('Socket error!', err)
      })
      socket.on('close', (err) => {
        logger.debug('Socket closed.', err)
        socket.destroy()
      })
      socket.on('data', (data) => {
        const key = data.toString('utf8').trim()
        if (!key) {
          socket.write('')
          socket.end()
        } else {
          let t1, t2, t3, t4
          t1 = Date.now()
          db.get(key)
            .then((ret) => {
              t2 = Date.now()
              if (!ret?.length) {
                socket.write('')
                socket.end()
              }
              const crc = crc32cBuffer(ret)
              t3 = Date.now()
              socket.write(crc, () =>
                socket.write(ret, () =>
                  socket.end(() => {
                    t4 = Date.now()
                    ;(isDev ? console.log : logger.debug)('Sending buffer...', {
                      key,
                      bufferSize: ret.length,
                      timing: t4 - t1,
                      timingQuery: t2 - t1,
                      timingCrc: t3 - t2,
                      timingSocket: t4 - t3,
                    })
                  })
                )
              )
            })
            .catch((e) => {
              if (!(e instanceof NotFoundError)) {
                logger.error(e)
              }
              socket.write('')
              socket.end()
            })
        }
      })
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

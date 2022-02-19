import { NotFoundError } from 'level-errors'
import { crc32cBuffer } from '../../utils/crc'
import { dataProviderLocalServerPort, isDev } from '../../utils/env'
import { dbListenPath, dbPath } from './db'
import { server as multileveldownServer } from 'multileveldown'
import { pipeline } from 'stream'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import PQueue from 'p-queue'
import duplexify from 'duplexify'
import eos from 'end-of-stream'
import fs from 'fs/promises'
import logger from '../../utils/logger'
import lpstream from 'length-prefixed-stream'
import net from 'net'
import rocksdb from 'rocksdb'

const localServer = (db, writeQueue) => {
  const encoder = lpstream.encode()
  const decoder = lpstream.decode()
  const stream = duplexify(decoder, encoder)

  const write = (data) =>
    writeQueue.add(
      () =>
        new Promise((resolve) => {
          encoder.write(data, (e) => {
            if (!e) {
              resolve()
            } else {
              logger.warn('Error when writing to stream.', e)
              resolve()
            }
          })
        })
    )

  eos(stream, () => {
    logger.debug('Stream ended!')
  })

  decoder.on('data', (data) => {
    if (data.length < 9) {
      logger.warn('Received invalid message.')
      return
    }
    const id = data.slice(0, 8)
    const key = data.slice(8).toString('utf8').trim()
    db.get(key)
      .then((ret) => {
        if (!ret?.length) {
          write(id)
          return
        }
        const crc = crc32cBuffer(ret)
        const buffer = Buffer.concat([id, crc, ret])
        ;(isDev ? console.log : logger.debug)('Sending buffer...', {
          key,
          valueSize: ret.length,
          bufferSize: buffer.length,
        })
        write(buffer)
      })
      .catch((e) => {
        if (!(e instanceof NotFoundError)) {
          logger.error(e)
        }
        write(id)
      })
  })

  return stream
}

const setupLocalServer = (db) =>
  new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      const writeQueue = new PQueue({ concurrency: 1 })
      logger.info(socket.address(), 'New blob server connection.')
      socket.on('error', (err) => {
        logger.error('Socket error!', err)
      })
      socket.on('close', () => {
        logger.info(socket.address(), 'Blob server connection closed.')
        socket.destroy()
      })
      pipeline(socket, localServer(db, writeQueue), socket, (err) => {
        if (err) {
          logger.error('Pipeline error!', err)
        }
      })
    })
    server.on('error', (err) => {
      logger.error(err)
      reject(err)
    })
    server.listen(dataProviderLocalServerPort, () => {
      resolve()
    })
  })

const setupInternalServer = (db) =>
  new Promise((resolve, reject) => {
    const ipcServer = net.createServer((socket) => {
      socket.on('error', (err) => {
        logger.error('Socket error!', err)
      })
      socket.on('close', () => {
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
      reject(err)
    })

    ipcServer.listen(dbListenPath, () => {
      process.send('ok')
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
  await setupInternalServer(db)
  await setupLocalServer(db)
}

export default start

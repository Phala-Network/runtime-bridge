import { dbListenPath, dbPath } from './db'
import { server as multileveldownServer } from 'multileveldown'
import { pipeline } from 'stream'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import fs from 'fs/promises'
import logger from '../../utils/logger'
import net from 'net'
import rocksdb from 'rocksdb'

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
  const server = net.createServer((socket) => {
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

  server.listen(dbListenPath, () => {
    process.send('ok')
  })
}

export default start

import { DB_ENCODING_DEFAULT } from './db_encoding'
import { getDb, setupDb } from './db'
import PQueue from 'p-queue'
import levelup from 'levelup'
import logger from '../utils/logger'
import rocksdb from 'rocksdb'

export const migrate = async (newDbNs, oldDbPath) => {
  let scanDone = false

  let total = 0
  let finished = 0
  let failed = 0

  await setupDb(newDbNs)
  const oldDb = levelup(rocksdb(oldDbPath), { ...DB_ENCODING_DEFAULT })
  const newDb = await getDb(newDbNs)

  const queue = new PQueue({
    concurrency: 1,
  })

  logger.info(`Existing data with same key will be overwritten.`)

  setInterval(() => {
    logger.info({ total, finished, failed }, 'Migrating keys...')
    if (scanDone && finished === total) {
      logger.info({ total, finished, failed }, 'Done.')
      process.exit(0)
    }
  }, 2000)

  await new Promise((resolve, reject) => {
    oldDb
      .createReadStream({ keyEncoding: 'utf8', valueEncoding: 'binary' })
      .on('data', ({ key, value }) => {
        total += 1
        const keyStr = key.toString()
        queue
          .add(() => newDb.put(keyStr, value))
          .then(() => {
            finished += 1
          })
          .catch((e) => {
            failed += 1
            finished += 1
            logger.error(`Error writing key: \`${keyStr}\``, e)
          })
      })
      .on('error', (err) => {
        logger.error('Error reading values.', err)
        reject(err)
      })
      .on('end', () => {
        scanDone = true
        resolve()
      })
  })
}

export default migrate

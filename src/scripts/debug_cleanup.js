import {
  LAST_COMMITTED_PARA_BLOCK,
  LAST_COMMITTED_PARENT_BLOCK,
} from '../utils/constants'
import { dbPath } from '../data_provider/io/db'
import EncodingDown from 'encoding-down'
import LevelUp from 'levelup'
import rocksdb from 'rocksdb'

const db = LevelUp(
  EncodingDown(rocksdb(dbPath), {
    keyEncoding: 'utf8',
    valueEncoding: 'binary',
  })
)

const delPrefix = (prefix) =>
  new Promise((resolve, reject) => {
    const s = db.createKeyStream({ gt: prefix })
    s.on('data', (key) => {
      db.del(key)
        .then(() => {
          console.log(`Deleted key ${key}.`)
        })
        .catch((e) => {
          console.error(`Error while deleting key ${key}:`, e)
        })
    })
    s.on('error', (e) => reject(e))
    s.on('end', () => resolve)
  })

async function main() {
  await db.del(LAST_COMMITTED_PARA_BLOCK)
  await db.del(LAST_COMMITTED_PARENT_BLOCK)
  await Promise.all([delPrefix('range'), delPrefix('blob')])
}

main().catch((e) => {
  console.error(e)
  process.exit(255)
})

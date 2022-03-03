import EncodingDown from 'encoding-down'
import levelUp from 'levelup'
import path from 'path'
import rocksdb from 'rocksdb'

const DATA_PATH = process.env.DATA_PATH ?? '/var/data/'

const main = async () => {
  const dbPath = path.join(DATA_PATH, '0')
  const db = levelUp(
    EncodingDown(rocksdb(dbPath), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })
  )
  const blob = await db.get(process.env.KEY)
  console.log(blob.toString('base64'))
}

main().catch((error) => {
  console.error(error)
  process.exit(255)
})

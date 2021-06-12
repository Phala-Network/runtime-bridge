import { DB_KEYS, DB_TOUCHED_AT, getDb } from '../io/db'

const main = () => {
  return Promise.all(
    DB_KEYS.map(getDb).map((db) => db.put(DB_TOUCHED_AT, Date.now()))
  )
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

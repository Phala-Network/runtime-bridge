import { DB_BLOCK } from '../io/db'
import migrate from '../io/migrate'

const OLD_DB_PATH = process.env.OLD_DB_PATH ?? '/var/data/0'

const start = async () => {
  return await migrate(DB_BLOCK, OLD_DB_PATH)
}

export default start

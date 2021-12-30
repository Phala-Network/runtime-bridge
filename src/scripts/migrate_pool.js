import { DB_WORKER } from '../data_provider/io/db'
import migrate from '../data_provider/io/migrate'

const OLD_DB_PATH = process.env.OLD_DB_PATH ?? '/var/data/1'

const start = async () => {
  return await migrate(DB_WORKER, OLD_DB_PATH)
}

export default start

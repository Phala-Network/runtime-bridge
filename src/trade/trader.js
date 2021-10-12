import { DB_WORKER, setupDb } from '../io/db'
import { setupPhalaApi } from '../utils/api'
import env from '../utils/env'

const start = async () => {
  await setupDb(DB_WORKER)
  await setupPhalaApi(env.chainEndpoint)
  process.send({ action: 'online' })
}

export default start

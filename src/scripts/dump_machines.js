import { DB_WORKER, setupDb } from '../io/db'
import { getAllWorker } from '../io/worker'

const main = async () => {
  await setupDb([], [DB_WORKER])
  console.log(JSON.stringify(await getAllWorker()))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

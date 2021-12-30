import { UPool, UWorker } from '../data_provider/io/worker'

const main = async () => {
  const [workers, pools] = await Promise.all([UWorker.getAll(), UPool.getAll()])
  console.log(JSON.stringify({ workers, pools }))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

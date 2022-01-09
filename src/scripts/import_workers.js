import { DB_WORKER, setupDb } from '../data_provider/io/db'
import { setWorker, validateWorkerInput } from '../data_provider/io/worker'

const main = async (data) => {
  await setupDb(DB_WORKER)
  for (const w of data) {
    await validateWorkerInput(w)
    await setWorker(w)
  }
}

try {
  let meta = ''
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read()
    if (chunk) {
      meta += chunk
    }
  })

  process.stdin.on('end', async () => {
    await main(JSON.parse(meta))
    process.exit(0)
  })
} catch (error) {
  console.log(error)
  process.exit(255)
}

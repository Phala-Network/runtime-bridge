import { DB_WORKER, setupDb } from '../io/db'
import { setWorker } from '../io/worker'

const main = async (data) => {
  await setupDb([DB_WORKER])
  for (const w of data) {
    await setWorker(w.id, w)
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

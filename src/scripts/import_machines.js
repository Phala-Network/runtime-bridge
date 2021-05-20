import { start as startOttoman } from '../utils/couchbase'
import { getModel } from 'ottoman'

const main = async (rows) => {
  await startOttoman(process.env.COUCHBASE_ENDPOINT)
  const Machine = getModel('Machine')

  await Machine.createMany(rows)
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
    await main(JSON.parse(meta).rows)
    process.exit(0)
  })
} catch (error) {
  console.log(error)
  process.exit(255)
}

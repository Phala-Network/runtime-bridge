import { start as startOttoman } from '../utils/couchbase'
import { getModel } from 'ottoman'

const main = async () => {
  await startOttoman(process.env.COUCHBASE_ENDPOINT)
  const Machine = getModel('Machine')

  const m = await Machine.find({})
  console.log(JSON.stringify(m))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

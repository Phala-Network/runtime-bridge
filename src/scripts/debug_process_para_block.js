import { debug__processParaBlock } from '../fetch/sync_block'
import { setupPhalaApi } from '../utils/api'
import env from '../utils/env'

const main = async () => {
  await setupPhalaApi(env.chainEndpoint)
  await debug__processParaBlock(411243)
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

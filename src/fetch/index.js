import { ApiPromise, WsProvider } from '@polkadot/api'
import types from '@/utils/typedefs.json'
import createRedisClient from '@/utils/redis'
import syncBlock from './sync_block'

const startFetch = async ({ phalaRpc, redisEndpoint }) => {
  const redis = createRedisClient(redisEndpoint)

  const provider = new WsProvider(phalaRpc)
  const api = await ApiPromise.create({ provider, types })

  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version()
  ])

  $logger.info(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`)

  globalThis.$api = api
  globalThis.$redis = redis

  syncBlock({ api, redis })
}

export default startFetch

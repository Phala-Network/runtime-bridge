import { ApiPromise, WsProvider } from '@polkadot/api'
import phalaTypes from '@/utils/typedefs.json'
import createRedisClient from '@/utils/redis'
import syncBlock from './sync_block'
import PhalaBlockModel from '@/models/phala_block'

const fetchPhala = async ({ phalaRpc, redis }) => {
  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({ provider: phalaProvider, types: phalaTypes })
  globalThis.$phalaApi = phalaApi

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (await Promise.all([
    phalaApi.rpc.system.chain(),
    phalaApi.rpc.system.name(),
    phalaApi.rpc.system.version()
  ])).map(i => i.toString())

  $logger.info(`You are connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`, { label: phalaChain })

  await syncBlock({ api: phalaApi, redis, chainName: phalaChain, BlockModel: PhalaBlockModel })
  $logger.info(`Synched to current highest finalized block.`, { label: phalaChain })
}

const startFetch = ({ phalaRpc, redisEndpoint }) => {
  const redis = createRedisClient(redisEndpoint)
  globalThis.$redis = redis

  return Promise.all([
    fetchPhala({ phalaRpc, redis })
  ])
}

export default startFetch

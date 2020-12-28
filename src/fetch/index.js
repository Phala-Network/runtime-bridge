import { ApiPromise, WsProvider } from '@polkadot/api'
import phalaTypes from '@/utils/typedefs.json'
import createRedisClient from '@/utils/redis'
import syncBlock from './sync_block'
import computeWindows from './compute_windows'
import PhalaBlockModel from '@/models/phala_block'
import { PHALA_CHAIN_NAME } from '@/utils/constants'

const fetchPhala = async ({ api, redis, chainName, parallelBlocks }) => {
  await syncBlock({ api, redis, chainName, BlockModel: PhalaBlockModel, parallelBlocks })
  $logger.info(`Synched to current highest finalized block.`, { label: chainName })
}

const startFetch = async ({ phalaRpc, redisEndpoint, parallelBlocks }) => {
  const redis = createRedisClient(redisEndpoint)
  globalThis.$redis = redis

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({ provider: phalaProvider, types: phalaTypes })
  globalThis.$phalaApi = phalaApi

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (await Promise.all([
    phalaApi.rpc.system.chain(),
    phalaApi.rpc.system.name(),
    phalaApi.rpc.system.version()
  ])).map(i => i.toString())

  await redis.set(PHALA_CHAIN_NAME, phalaChain)
  $logger.info(`Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`, { label: phalaChain })

  await Promise.all([
    fetchPhala({ api: phalaApi, chainName: phalaChain, redis, parallelBlocks }),
    computeWindows({ api: phalaApi, chainName: phalaChain, redis, BlockModel: PhalaBlockModel })
  ])
}

export default startFetch

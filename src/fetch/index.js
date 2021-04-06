import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '@/utils/couchbase'
import phalaTypes from '@/utils/typedefs'
import createRedisClient from '@/utils/redis'
import syncBlock from './sync_block'
import computeWindow from './compute_window'
import organizeBlob from './organize_blob'
import { PHALA_CHAIN_NAME } from '@/utils/constants'
import { isMaster } from 'cluster'
import { getModel } from 'ottoman'

const fetchPhala = async ({ api, redis, chainName, BlockModel, parallelBlocks }) => {
  await syncBlock({ api, redis, chainName, BlockModel, parallelBlocks })
  $logger.info(`Synched to current highest finalized block.`, { label: chainName })
}

const start = async ({ phalaRpc, couchbaseEndpoint, redisEndpoint, parallelBlocks }) => {
  const redis = await createRedisClient(redisEndpoint, true)
  globalThis.$redis = redis

  await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({ provider: phalaProvider, types: phalaTypes })
  globalThis.$phalaApi = phalaApi

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (await Promise.all([
    phalaApi.rpc.system.chain(),
    phalaApi.rpc.system.name(),
    phalaApi.rpc.system.version()
  ])).map(i => i.toString())

  const PhalaBlockModel = getModel('PhalaBlock')

  if (isMaster) {
    await redis.set(PHALA_CHAIN_NAME, phalaChain)
    $logger.info({ chain: phalaChain }, `Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`)

    await Promise.all([
      fetchPhala({ api: phalaApi, chainName: phalaChain, redis, parallelBlocks, BlockModel: PhalaBlockModel }),
      computeWindow({ api: phalaApi, chainName: phalaChain, redis, BlockModel: PhalaBlockModel })
    ])
  } else {
    await organizeBlob({
      api: phalaApi,
      chainName: phalaChain,
      redis,
      BlockModel: PhalaBlockModel,
      initHeight: process.env.INIT_HEIGHT
    })
  }
}

export default start

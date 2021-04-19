import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '../utils/couchbase'
import phalaTypes from '../utils/typedefs'
import createRedisClient from '../utils/redis'
import syncBlock from './sync_block'
import computeWindow from './compute_window'
import organizeBlob from './organize_blob'
import { PHALA_CHAIN_NAME } from '../utils/constants'
import { isMaster } from 'cluster'
import { getModel } from 'ottoman'
import { createMessageTunnel, createDispatcher } from '../message'
import { hostname } from 'os'
import { MessageTarget } from '../message/proto'

const fetchPhala = async ({
  api,
  redis,
  chainName,
  BlockModel,
  parallelBlocks,
}) => {
  await syncBlock({ api, redis, chainName, BlockModel, parallelBlocks })
  $logger.info(`Synched to current highest finalized block.`, {
    label: chainName,
  })
}

const start = async ({
  phalaRpc,
  couchbaseEndpoint,
  redisEndpoint,
  parallelBlocks,
}) => {
  const redis = await createRedisClient(redisEndpoint, true)
  globalThis.$redis = redis

  await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
  })

  if (process.env.NODE_ENV === 'development') {
    globalThis.$phalaApi = phalaApi
  }

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (
    await Promise.all([
      phalaApi.rpc.system.chain(),
      phalaApi.rpc.system.name(),
      phalaApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  const PhalaBlockModel = getModel('PhalaBlock')

  if (isMaster) {
    const tunnelConnection = await createMessageTunnel({
      redisEndpoint,
      from: MessageTarget.values.MTG_FETCHER,
    })
    const { subscribe } = tunnelConnection

    const dispatcher = createDispatcher({
      tunnelConnection,
      queryHandlers: {
        callOnlineFetcher: (message) => {
          $logger.info('callOnlineFetcher', message)
          return {
            fetcherStateUpdate: {
              hostname: hostname(),
            },
          }
        },
      },
      plainHandlers: {},
      dispatch: (message) => {
        if (message.to === 'MTG_BROADCAST' || message.to === 'MTG_FETCHER') {
          switch (message.type) {
            case 'MTP_QUERY':
              dispatcher.queryCallback(message)
              break
            case 'MTP_REPLY':
              dispatcher.replyCallback(message)
              break
            default:
              dispatcher.plainCallback(message)
              break
          }
        }
      },
    })
    await subscribe(dispatcher)
    $logger.info(
      'Now listening to the redis channel, old messages may be ignored.'
    )

    await redis.set(PHALA_CHAIN_NAME, phalaChain)
    $logger.info(
      { chain: phalaChain },
      `Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`
    )

    await fetchPhala({
      api: phalaApi,
      chainName: phalaChain,
      redis,
      parallelBlocks,
      BlockModel: PhalaBlockModel,
    })
  } else {
    if (process.env.PRB_FETCH_WORKER_TYPE === 'window') {
      computeWindow({
        api: phalaApi,
        chainName: phalaChain,
        redis,
        BlockModel: PhalaBlockModel,
      })
    }
    if (process.env.PRB_FETCH_WORKER_TYPE === 'blob') {
      await organizeBlob({
        api: phalaApi,
        chainName: phalaChain,
        redis,
        BlockModel: PhalaBlockModel,
        initHeight: process.env.INIT_HEIGHT,
      })
    }
  }
}

export default start

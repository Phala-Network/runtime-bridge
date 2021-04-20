import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '../utils/couchbase'
import phalaTypes from '../utils/typedefs'
import createRedisClient from '../utils/redis'
import syncBlock from './sync_block'
import computeWindow from './compute_window'
import organizeBlob from './organize_blob'
import {
  FETCH_PROCESSED_BLOB,
  PHALA_CHAIN_NAME,
  FETCH_IS_SYNCHED,
} from '../utils/constants'
import cluster, { isMaster } from 'cluster'
import { getModel } from 'ottoman'
import { createMessageTunnel, createDispatcher } from '../message'
import { hostname } from 'os'
import { MessageTarget } from '../message/proto'

const _hostname = hostname()

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
  await startOttoman(couchbaseEndpoint)

  if (isMaster) {
    const rpcWorker = cluster.fork({ PRB_FETCH_WORKER_TYPE: 'rpc' })
    rpcWorker.on('online', () => {
      $logger.info('Started worker for Redis RPC...')
    })
    rpcWorker.on('exit', (code, signal) => {
      if (signal) {
        console.log(`worker was killed by signal: ${signal}`)
      } else if (code !== 0) {
        console.log(`worker exited with error code: ${code}`)
      } else {
        console.log('worker success!')
      }
      process.exit(code)
    })

    const blockWorker = cluster.fork({ PRB_FETCH_WORKER_TYPE: 'block' })
    blockWorker.on('online', () => {
      $logger.info('Started worker for synching blocks...')
    })
    blockWorker.on('exit', (code, signal) => {
      if (signal) {
        console.log(`worker was killed by signal: ${signal}`)
      } else if (code !== 0) {
        console.log(`worker exited with error code: ${code}`)
      } else {
        console.log('worker success!')
      }
      process.exit(code)
    })
    blockWorker.on('message', (oldHighest) => {
      const windowWorker = cluster.fork({
        PRB_FETCH_WORKER_TYPE: 'window',
        INIT_HEIGHT: oldHighest,
      })
      windowWorker.on('online', () => {
        $logger.info('Started worker for computing windows...')
      })
      windowWorker.on('exit', (code, signal) => {
        if (signal) {
          console.log(`worker was killed by signal: ${signal}`)
        } else if (code !== 0) {
          console.log(`worker exited with error code: ${code}`)
        } else {
          console.log('worker success!')
        }
        process.exit(code)
      })

      const blobWorker = cluster.fork({
        PRB_FETCH_WORKER_TYPE: 'blob',
        INIT_HEIGHT: oldHighest,
      })
      blobWorker.on('online', () => {
        $logger.info('Started worker for organizing blobs...')
      })
      blobWorker.on('exit', (code, signal) => {
        if (signal) {
          console.log(`worker was killed by signal: ${signal}`)
        } else if (code !== 0) {
          console.log(`worker exited with error code: ${code}`)
        } else {
          console.log('worker success!')
        }
        process.exit(code)
      })
    })
  } else {
    const redis = await createRedisClient(redisEndpoint, true)
    if (process.env.NODE_ENV === 'development') {
      globalThis.$redis = redis
    }

    if (process.env.PRB_FETCH_WORKER_TYPE === 'rpc') {
      await redis.set(FETCH_IS_SYNCHED, false)
      await redis.set(FETCH_PROCESSED_BLOB, 0)

      const tunnelConnection = await createMessageTunnel({
        redisEndpoint,
        from: MessageTarget.values.MTG_FETCHER,
      })
      const { subscribe } = tunnelConnection

      const dispatcher = createDispatcher({
        tunnelConnection,
        queryHandlers: {
          callOnlineFetcher: async (message) => {
            $logger.info(message, 'callOnlineFetcher')

            const currentBlockNumber = parseInt(
              await redis.get(FETCH_PROCESSED_BLOB)
            )
            const synched = (await redis.get(FETCH_IS_SYNCHED)) === 'true'

            return {
              fetcherStateUpdate: {
                hostname: _hostname,
                latestHeaderPhala: currentBlockNumber,
                latestHeaderRococo: 0,
                latestBlock: currentBlockNumber,
                synched,
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
      return
    }

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

    if (process.env.PRB_FETCH_WORKER_TYPE === 'block') {
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
    }

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

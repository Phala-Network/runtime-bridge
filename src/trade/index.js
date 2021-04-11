import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '@/utils/couchbase'
import phalaTypes from '@/utils/typedefs'
import createRedisClient from '@/utils/redis'
import { createMessageTunnel, createDispatcher } from '@/message'
import { MessageTarget } from '../message/proto'

const start = async ({ phalaRpc, couchbaseEndpoint, redisEndpoint }) => {
  const redis = await createRedisClient(redisEndpoint, true)
  globalThis.$redis = redis

  await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
  })
  globalThis.$phalaApi = phalaApi

  const tunnelConnection = await createMessageTunnel({
    redisEndpoint,
    from: MessageTarget.values.MTG_FETCHER,
  })
  const { subscribe } = tunnelConnection

  const dispatcher = createDispatcher({
    tunnelConnection,
    queryHandlers: {},
    plainHandlers: {},
    dispatch: (message) => {
      if (message.to === 'MTG_BROADCAST' || message.to === 'MTG_TRADE_WORKER') {
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
}

export default start

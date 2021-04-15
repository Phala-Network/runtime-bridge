import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '@/utils/couchbase'
import phalaTypes from '@/utils/typedefs'
import { createMessageTunnel, createDispatcher } from '@/message'
import { MessageTarget } from '@/message/proto'
import createTradeQueue from '@/utils/trade_queue'
import createKeyring from '@/utils/keyring'
import * as actions from './actions'

const start = async ({ phalaRpc, couchbaseEndpoint, redisEndpoint }) => {
  await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
  })
  if (process.env.NODE_ENV === 'development') {
    globalThis.$phalaApi = phalaApi
  }

  const keyring = await createKeyring()

  const tunnelConnection = await createMessageTunnel({
    redisEndpoint,
    from: MessageTarget.values.MTG_FETCHER,
  })
  const { subscribe } = tunnelConnection

  const txQueue = createTradeQueue(redisEndpoint)
  await txQueue.ready()

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

  txQueue.process(async (job) => {
    $logger.info(job.data, `Processing job #${job.id}...`)
    const actionFn = actions[job.data.action]

    try {
      const ret = await actionFn(job.data.payload, {
        txQueue,
        keyring,
        api: phalaApi,
      })
      $logger.info(`Job #${job.id} finished.`)
      return ret
    } catch (e) {
      $logger.warn(e, `Job #${job.id} failed with error.`)
      throw e
    }
  })
}

export default start

import { start as startOttoman } from '@/utils/couchbase'
import { createMessageTunnel, createDispatcher } from '@/message'
import { MessageTarget } from '../message/proto'

const waitForFetcher = async (query) => {
  // todo: wait for synching
  await query({
    to: MessageTarget.values.MTG_FETCHER,
    callOnlineFetcher: {},
  })
}

const start = async ({ phalaRpc, redisEndpoint, couchbaseEndpoint }) => {
  const workerStates = new Map() // key => Machine.id from couchbase

  await startOttoman(couchbaseEndpoint)
  const tunnelConnection = await createMessageTunnel({
    redisEndpoint,
    from: MessageTarget.values.MTG_MANAGER,
  })
  const { subscribe, query } = tunnelConnection

  const dispatcher = createDispatcher({
    tunnelConnection,
    queryHandlers: {},
    plainHandlers: {},
    dispatch: (message) => {
      try {
        if (
          message.to === 'MTG_BROADCAST' ||
          message.to === 'MTG_MANAGER' ||
          message.to === 'MTG_WORKER'
        ) {
          switch (message.type) {
            case 'MTP_QUERY':
              dispatcher.queryCallback(message)
              break
            case 'MTP_REPLY': // REPLY
              dispatcher.replyCallback(message)
              break
            default:
              dispatcher.plainCallback(message)
              break
          }
        }
      } catch (error) {
        $logger.error(error)
      }
    },
  })

  // init rpc
  await subscribe(dispatcher)
  $logger.info(
    'Now listening to the redis channel, old messages may be ignored.'
  )

  await waitForFetcher(query)
  // todo: prepare accounts to monitor

  // todo: init polkadotjs
  // todo: monitor account

  // todo: setup worker states
}

export default start

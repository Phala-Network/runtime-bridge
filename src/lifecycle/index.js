import { start as startOttoman } from '@/utils/couchbase'
import { createMessageTunnel, createDispatcher } from '@/message'

const start = async ({ redisEndpoint, couchbaseEndpoint }) => {
  const workerStates = new Map() // key => Machine.id from couchbase

  await startOttoman(couchbaseEndpoint)
  const tunnelConnection = await createMessageTunnel({
    redisEndpoint,
    from: 2
  })
  const { subscribe } = tunnelConnection

  const dispatcher = createDispatcher({
    tunnelConnection,
    queryHandlers: {},
    plainHandlers: {},
    dispatch: message => {
      if (message.to === 0 || message.to === 1 || message.to === 4) { // BROADCAST, MANAGER, WORKER
        switch (message.type) {
          case 1: // QUERY
            dispatcher.queryCallback(message)
            break
          case 2: // REPLY
            dispatcher.replyCallback(message)
            break
          default:
            dispatcher.plainCallback(message)
            break
        }
      }
    }
  })

  // init rpc
  await subscribe(dispatcher)
  $logger.info('Now listening to the redis channel, old messages may be ignored.')

  // todo: wait for fetcher
  // todo: prepare accounts to monitor

  // todo: init polkadotjs
  // todo: monitor account

  // todo: setup worker states
}

export default start

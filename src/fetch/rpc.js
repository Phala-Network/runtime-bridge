import { MessageTarget } from '../message/proto'
import { createDispatcher, createMessageTunnel } from '../message'
import env from '../utils/env'

const setupRpc = async (context) => {
  const tunnelConnection = await createMessageTunnel({
    redisEndpoint: env.redisEndpoint,
    from: MessageTarget.MTG_FETCHER,
  })

  const { query, subscribe } = tunnelConnection

  const injectMessage = (message) =>
    Object.assign(message, {
      context,
    })

  const dispatcher = createDispatcher({
    tunnelConnection,
    dispatch: async (message) => {
      try {
        if (message.to === 'MTG_BROADCAST' || message.to === 'MTG_FETCHER') {
          switch (message.type) {
            case 'MTP_QUERY':
              dispatcher.queryCallback(injectMessage(message))
              break
            case 'MTP_REPLY':
              dispatcher.replyCallback(injectMessage(message))
              break
            default:
              dispatcher.plainCallback(injectMessage(message))
              break
          }
        }
      } catch (error) {
        $logger.error(error)
      }
    },
    queryHandlers: {
      callOnlineFetcher: async () => {
        return {
          fetcherStateUpdate: {
            ...context,
          },
        }
      },
    },
    plainHandlers: {},
  })

  Object.assign(context, {
    dispatcher,
    query,
    tunnelConnection,
  })
  await subscribe(dispatcher)
  $logger.info('Now listening to the redis channel for RPC.')
}

export default setupRpc

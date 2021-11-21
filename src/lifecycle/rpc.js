import { DB_WORKER } from '../io/db'
import { MessageTarget } from '../message/proto'
import { createDispatcher, createMessageTunnel } from '../message'
import createHandlers from './handlers'
import env from '../utils/env'
import logger from '../utils/logger'

const setupRpc = async (context) => {
  const tunnelConnection = await createMessageTunnel({
    redisEndpoint: env.redisEndpoint,
    from: MessageTarget.MTG_MANAGER,
    ns: DB_WORKER,
  })

  const { subscribe, query } = tunnelConnection

  const injectMessage = (message) =>
    Object.assign(message, {
      context,
    })

  const dispatcher = createDispatcher({
    tunnelConnection,
    ...createHandlers(context),
    dispatch: async (message) => {
      try {
        if (message.to === 'MTG_BROADCAST' || message.to === 'MTG_MANAGER') {
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
        logger.error(error)
      }
    },
  })

  Object.assign(context, {
    dispatcher,
    query,
    tunnelConnection,
  })
  await subscribe(dispatcher)

  logger.info('Now listening to the redis channel for RPC.')
}

export default setupRpc

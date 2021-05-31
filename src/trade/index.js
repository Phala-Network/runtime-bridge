import { ApiPromise, WsProvider } from '@polkadot/api'
import { start as startOttoman } from '../utils/couchbase'
import phalaTypes from '../utils/typedefs'
import { createMessageTunnel, createDispatcher } from '../message'
import { MessageTarget } from '../message/proto'
import createTradeQueue, { createSubQueue } from '../utils/trade_queue'
import createKeyring from '../utils/keyring'
import * as actions from './actions'
import { TX_QUEUE_SIZE } from '../utils/constants'
import { typesBundle, typesChain } from '@polkadot/apps-config'
import { typesChain as phalaTypesChain } from '@phala/typedefs'

const start = async ({ phalaRpc, couchbaseEndpoint, redisEndpoint }) => {
  await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
    typesBundle,
    typesChain: {
      ...typesChain,
      ...phalaTypesChain,
    },
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
  const subQueues = new Map()

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

  txQueue.process(TX_QUEUE_SIZE, async (job) => {
    $logger.info(job.data, `Processing job #${job.id}...`)

    const { machineRecordId } = job.data.payload

    let subQueue = subQueues.get(machineRecordId)
    if (!subQueue) {
      subQueue = createSubQueue({
        redisUrl: redisEndpoint,
        machineRecordId,
        actions,
        txQueue,
        keyring,
        api: phalaApi,
      })
      subQueues.set(machineRecordId, subQueue)
    }

    try {
      const ret = await subQueue.dispatch(job.data)
      $logger.info(`Job #${job.id} finished.`)
      return ret
    } catch (e) {
      $logger.warn(e, `Job #${job.id} failed with error.`)
      throw e
    }
  })
}

export default start

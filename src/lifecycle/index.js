import { start as startOttoman } from '../utils/couchbase'
import { createMessageTunnel, createDispatcher } from '../message'
import { MessageTarget } from '../message/proto'
import { getModel } from 'ottoman'
import { createWorkerState } from './worker'
import { ApiPromise, WsProvider } from '@polkadot/api'
import phalaTypes from '../utils/typedefs'
import createHandlers from './handlers'
import createTradeQueue from '../utils/trade_queue'

const updateFetcherState = async (query, state) => {
  const { content: fetcherStateUpdate } = await query({
    to: MessageTarget.values.MTG_FETCHER,
    callOnlineFetcher: {},
  })
  Object.assign(state, fetcherStateUpdate)
  $logger.debug(state, 'fetcher state updated.')
  return state
}

const waitForFetcher = async (query, state) => {
  // todo: wait for synching
  await updateFetcherState(query, state)

  setInterval(() => updateFetcherState(query, state), 3000)
}

const start = async ({ phalaRpc, redisEndpoint, couchbaseEndpoint }) => {
  let dispatcher
  const workerStates = new Map() // key => Machine.id from couchbase

  const fetcherState = {}

  const ottoman = await startOttoman(couchbaseEndpoint)

  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
  })

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (
    await Promise.all([
      phalaApi.rpc.system.chain(),
      phalaApi.rpc.system.name(),
      phalaApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  $logger.info(
    { chain: phalaChain },
    `Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`
  )

  const tunnelConnection = await createMessageTunnel({
    redisEndpoint,
    from: MessageTarget.values.MTG_MANAGER,
  })
  const { subscribe, query } = tunnelConnection

  const txQueue = createTradeQueue(redisEndpoint)
  await txQueue.ready()

  const setupWorkerContexts = async () => {
    const Machine = getModel('Machine')
    const { rows: machines } = await Machine.find({})
    return Promise.all(
      machines.map(async (m) => {
        if (workerStates.get(m.id)) {
          return
        }
        workerStates.set(
          m.id,
          await createWorkerState({
            machine: m,
            context: {
              workerStates,
              fetcherState,
              phalaApi,
              setupWorkerContexts,
              ottoman,
              dispatcher,
              txQueue,
            },
          })
        )
      })
    )
  }

  const injectMessage = (message) =>
    Object.assign(message, {
      context: {
        workerStates,
        fetcherState,
        phalaApi,
        setupWorkerContexts,
        ottoman,
        dispatcher,
        txQueue,
      },
    })

  dispatcher = createDispatcher({
    tunnelConnection,
    ...createHandlers({
      workerStates,
      fetcherState,
      phalaApi,
      setupWorkerContexts,
      ottoman,
      dispatcher,
      txQueue,
    }),
    dispatch: (message) => {
      try {
        if (
          message.to === 'MTG_BROADCAST' ||
          message.to === 'MTG_MANAGER' ||
          message.to === 'MTG_WORKER'
        ) {
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
  })

  await subscribe(dispatcher)
  $logger.info(
    'Now listening to the redis channel, old messages may be ignored.'
  )

  await waitForFetcher(query, fetcherState)
  $logger.info('Found online fetcher.')

  await setupWorkerContexts()
}

export default start

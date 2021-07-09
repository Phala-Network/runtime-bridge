import { DB_BLOCK, DB_WINDOW, DB_WORKER, setupDb } from '../io/db'
import { EventEmitter } from 'events'
import { MessageTarget } from '../message/proto'
import { setupPhalaApi } from '../utils/api'
import { watchWorkers } from './lifecycle'
import createTradeQueue from '../utils/trade_queue'
import env from '../utils/env'
import setupRpc from './rpc'

const updateFetcherState = async (query, state) => {
  const { content: fetcherStateUpdate } = await query({
    to: MessageTarget.values.MTG_FETCHER,
    callOnlineFetcher: {},
  })
  Object.assign(state, fetcherStateUpdate.fetcherStateUpdate)
  $logger.debug(state, 'fetcher state updated.')
  return state
}

const start = async () => {
  await setupDb(DB_WORKER, DB_BLOCK, DB_WINDOW)
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.redisEndpoint)
  await txQueue.ready()

  const context = {
    workerContexts: new Map(),
    fetchStatus: {},
    eventEmitter: new EventEmitter(),
    dispatcher: null,
    query: null,
    tunnelConnection: null,
    txQueue,
    _dispatchTx: txQueue.dispatch,
  }

  await setupRpc(context)

  await updateFetcherState(context.query, context.fetchStatus)
  setInterval(
    () => updateFetcherState(context.query, context.fetchStatus),
    1000
  )

  await watchWorkers(context)
  return
}

export default start

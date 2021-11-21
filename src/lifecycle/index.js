import { DB_BLOCK, DB_WINDOW, DB_WORKER, setupDb } from '../io/db'
import { EventEmitter } from 'events'
import { MessageTarget } from '../message/proto'
import { SET_PARA_KNOWN_HEIGHT } from '../fetch'
import { getGenesis } from '../io/block'
import { phalaApi, setupPhalaApi } from '../utils/api'
import { watchWorkers } from './lifecycle'
import createTradeQueue from '../trade/trade_queue'
import env, { minBenchScore } from '../utils/env'
import logger from '../utils/logger'
import setupRpc from './rpc'

const updateFetcherState = async (query, state) => {
  const { content: fetcherStateUpdate } = await query({
    to: MessageTarget.MTG_FETCHER,
    callOnlineFetcher: {},
  })
  Object.assign(state, fetcherStateUpdate.fetcherStateUpdate)
  logger.debug(state, 'fetcher state updated.')
  return state
}

const start = async () => {
  await setupDb(DB_WORKER, DB_BLOCK, DB_WINDOW)
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.qRedisEndpoint)
  await txQueue.ready()

  logger.info({ minBenchScore })

  const context = {
    workerContexts: new Map(),
    pools: new Map(),
    genesis: null,
    fetchStatus: {
      paraId: (await phalaApi.query.parachainInfo.parachainId()).toNumber(),
    },
    eventEmitter: new EventEmitter(),
    dispatcher: null,
    query: null,
    tunnelConnection: null,
    txQueue,
    _dispatchTx: txQueue.dispatch,
  }

  await phalaApi.rpc.chain.subscribeFinalizedHeads((header) => {
    context.fetchStatus.paraBlobHeight = header.number.toNumber()
  })

  await setupRpc(context)

  context.genesis = await getGenesis(context.fetchStatus.paraId)

  await watchWorkers(context)
}

export default start

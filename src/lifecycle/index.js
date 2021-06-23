import { DB_BLOCK, DB_WORKER, setupDb } from '../io/db'
import { EventEmitter } from 'events'
import { setupPhalaApi } from '../utils/api'
import { watchWorkers } from './lifecycle'
import createTradeQueue from '../utils/trade_queue'
import env from '../utils/env'
import setupRpc from './rpc'

const start = async () => {
  await setupDb([DB_WORKER], [DB_BLOCK])
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.redisEndpoint)
  await txQueue.ready()

  const context = {
    workerContexts: new Map(),
    fetchStatus: null,
    eventEmitter: new EventEmitter(),
    dispatcher: null,
    query: null,
    tunnelConnection: null,
    txQueue,
    _dispatchTx: txQueue.dispatch,
  }

  await setupRpc(context)
  await watchWorkers(context)

  return
}

export default start

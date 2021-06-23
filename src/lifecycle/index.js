import { DB_WORKER, setupDb } from '../io/db'
import { EventEmitter } from 'events'
import { setupPhalaApi } from '../utils/api'
import { watchWorkers } from './lifecycle'
import PQueue from 'p-queue'
import createTradeQueue from '../utils/trade_queue'
import env from '../utils/env'
import setupRpc from './rpc'

const start = async () => {
  await setupDb([DB_WORKER])
  await setupPhalaApi(env.chainEndpoint)
  const txQueue = createTradeQueue(env.redisEndpoint)
  await txQueue.ready()

  const innerTxQueue = new PQueue({
    concurrency: 1,
  })

  const dispatchTx = (...args) =>
    innerTxQueue.add(() => txQueue.dispatch(...args))

  const context = {
    workerContexts: new Map(),
    fetchStatus: null,
    eventEmitter: new EventEmitter(),
    dispatcher: null,
    query: null,
    tunnelConnection: null,
    txQueue,
    innerTxQueue,
    dispatchTx,
  }

  await setupRpc(context)
  await watchWorkers(context)

  return
}

export default start

import { DB_WORKER, setupDb } from '../io/db'
import { EventEmitter } from 'events'
import { setupPhalaApi } from '../utils/api'
import { watchWorkers } from './lifecycle'
import env from '../utils/env'
import startRpc from './rpc'

const start = async () => {
  await setupDb([DB_WORKER])
  await setupPhalaApi(env.chainEndpoint)

  const context = {
    workerContexts: new Map(),
    fetchStatus: null,
    eventEmitter: new EventEmitter(),
  }

  await Promise.all([startRpc(context), watchWorkers(context)])

  return
}

export default start

import { EventEmitter } from 'events'
import { watchWorkers } from './lifecycle'
import startRpc from './rpc'

const start = async () => {
  const context = {
    workerContexts: new Map(),
    fetchStatus: null,
    eventEmitter: new EventEmitter(),
  }

  await Promise.all([startRpc(context), watchWorkers(context)])

  return
}

export default start

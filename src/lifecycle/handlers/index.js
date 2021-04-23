import { callOnlineLifecycleManager, fetcherStateUpdate } from './infra'
import {
  queryAccountState,
  queryWorkerState,
  requestCreateWorker,
  requestKickWorker,
  requestUpdateWorker,
  requestStartWorkerLifecycle,
} from './worker'

export default (context) => {
  // context = {
  //   workerStates,
  //   fetcherState,
  //   phalaApi,
  //   setupWorkerContexts,
  //   ottoman,
  //   dispatcher,
  // }
  const wrapHandler = (fn) => {
    return (message) => fn(message, context)
  }
  return {
    queryHandlers: {
      callOnlineLifecycleManager: wrapHandler(callOnlineLifecycleManager),
      queryWorkerState: wrapHandler(queryWorkerState),
      queryAccountState: wrapHandler(queryAccountState),
      requestKickWorker: wrapHandler(requestKickWorker),
      requestCreateWorker: wrapHandler(requestCreateWorker),
      requestUpdateWorker: wrapHandler(requestUpdateWorker),
      requestStartWorkerLifecycle: wrapHandler(requestStartWorkerLifecycle),
    },
    plainHandlers: {
      fetcherStateUpdate: wrapHandler(fetcherStateUpdate),
    },
  }
}

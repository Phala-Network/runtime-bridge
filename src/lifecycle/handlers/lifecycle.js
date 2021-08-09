const getWorkerStates = (ids, context) =>
  ids.map((id) => {
    const w = context.workerContexts.get(id)
    const { runtimeInfo, info, syncStatus } = w.runtime
    return {
      status: w.stateMachineState,
      initialized: info.initialized,
      parentHeaderSynchedTo: syncStatus?.parentHeaderSynchedTo,
      paraHeaderSynchedTo: syncStatus?.paraHeaderSynchedTo - 1,
      paraBlockDispatchedTo: syncStatus?.paraBlockDispatchedTo,
      worker: w.snapshotBrief,
      publicKey: runtimeInfo.publicKey,
      lastErrorMessage: w.errorMessage,
    }
  })

const queryWorkerState = async (message, context) => {
  const ids = message.content.queryWorkerState.ids.map((i) => i.uuid)
  const results = getWorkerStates(ids, context)
  return {
    workerStateUpdate: {
      workerStates: results,
    },
  }
}
const requestKickWorker = async (message, context) => {}
const requestStartLifeCycle = async (message, context) => {}

export default {
  queryHandlers: {
    queryWorkerState,
    requestKickWorker,
    requestStartLifeCycle,
  },
  plainHandlers: {},
}

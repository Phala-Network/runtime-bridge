export const queryWorkerState = (message, context) => {
  // todo: return only requested entries
  return {
    workerStateUpdate: {
      values: [],
    },
  }
}
export const requestKickWorker = (message, context) => {}
export const requestCreateWorker = (message, context) => {}
export const requestUpdateWorker = (message, context) => {}
export const requestStartWorkerLifecycle = (message, context) => {}

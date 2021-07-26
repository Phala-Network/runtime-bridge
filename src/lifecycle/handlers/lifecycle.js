const queryWorkerState = async (message, context) => {}
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

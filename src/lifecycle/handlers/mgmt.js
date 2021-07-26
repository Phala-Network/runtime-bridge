const getAllPools = async (context) => {}
const getAllWorkers = async (context) => {}

const requestCreatePool = async (message, context) => {}
const requestUpdatePool = async (message, context) => {}
const requestCreateWorker = async (message, context) => {}
const requestUpdateWorker = async (message, context) => {}

export default {
  queryHandlers: {
    requestCreatePool,
    requestUpdatePool,
    requestCreateWorker,
    requestUpdateWorker,
  },
  plainHandlers: {},
}

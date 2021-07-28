import { UPool, UWorker } from '../../io/worker'
import logger from '../../utils/logger'
import os from 'os'

export const returnAllWorkers = async () => {
  const [pools, workers] = await Promise.all([UPool.getAll(), UWorker.getAll()])
  return {
    lifecycleManagerStateUpdate: {
      hostname: os.hostname(),
      pools,
      workers,
    },
  }
}

export const callOnlineLifecycleManager = async () => {
  return returnAllWorkers()
}

export const fetcherStateUpdate = async (message, context) => {
  context.fetchStatus = message
  logger.info(message, 'fetcherStateUpdate')

  return {
    ack: {
      ack: true,
    },
  }
}

export default {
  queryHandlers: {
    callOnlineLifecycleManager,
  },
  plainHandlers: {
    fetcherStateUpdate,
  },
}

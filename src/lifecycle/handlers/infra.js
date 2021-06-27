import logger from '../../utils/logger'
import os from 'os'

export const callOnlineLifecycleManager = async () => {
  return {
    lifecycleManagerStateUpdate: {
      hostname: os.hostname(),
    },
  }
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

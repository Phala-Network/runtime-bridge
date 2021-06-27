import { callOnlineLifecycleManager, fetcherStateUpdate } from './infra'

const createHandlers = (context) => {
  const wrapHandler = (fn) => {
    return (message) => fn(message, context)
  }

  return {
    queryHandlers: {
      callOnlineLifecycleManager: wrapHandler(callOnlineLifecycleManager),
    },
    plainHandlers: {
      fetcherStateUpdate: wrapHandler(fetcherStateUpdate),
    },
  }
}

export default createHandlers

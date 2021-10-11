import createTradeQueue from './trade_queue'
import env from '../utils/env'

const messageBus = {}

const startMessageBus = async (appContext) => {
  const inputQueue = createTradeQueue(env.qRedisEndpoint)
  await inputQueue.ready()

  Object.assign(appContext, {})
}

export default startMessageBus
export { messageBus }

import createTraderManager from './trader_manager'
import startMessageBus from './bus'

const start = async () => {
  const appContext = {}

  createTraderManager(appContext)
  await startMessageBus(appContext)
}

export default start

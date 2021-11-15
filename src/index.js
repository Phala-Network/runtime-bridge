import env from './utils/env'
import logger from './utils/logger'

logger.debug(env)

const modulePath = './' + env.moduleName

const { default: start } = await import(modulePath)

try {
  await start()
} catch (e) {
  logger.error(e)
  process.exit(-1)
}

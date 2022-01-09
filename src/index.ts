import env from './utils/env'
import logger from './utils/logger'

logger.info(env)
;(async () => {
  const { default: start } = await import('./' + env.moduleName)

  try {
    await start()
  } catch (e) {
    logger.error(e)
    process.exit(-1)
  }
})()

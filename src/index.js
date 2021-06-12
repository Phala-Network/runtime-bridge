import env from './utils/env'
import logger from './utils/logger'

globalThis.$logger = logger
logger.debug(env)

const modulePath = './' + env.moduleName

import(modulePath)
  .then(({ default: start }) => start())
  .catch((...e) => {
    $logger.error(...e)
    process.exit(-1)
  })

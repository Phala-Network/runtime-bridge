import { createLogger } from 'bunyan'
import env from './env'

export const logger = createLogger({
  level: env.loggerLevel || 'info',
  name: 'prb',
  src: process.env.LOGGER_SRC === 'true',
})
export const loggerLevel = logger.level()
logger.info({ loggerLevel }, 'Logging Enabled.')

export default logger

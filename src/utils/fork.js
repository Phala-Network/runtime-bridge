import cluster, { isMaster } from 'cluster'
import logger from '../utils/logger'

export const fork = (name, moduleName, env = {}) => {
  if (!isMaster) {
    throw new Error('Not a master process.')
  }

  const worker = cluster.fork({
    PHALA_MODULE: moduleName,
    ...env,
  })

  worker.on('online', () => {
    logger.info({ name, moduleName }, 'Subprocess online.')
  })

  worker.on('exit', (code, signal) => {
    if (signal) {
      logger.info({ name, moduleName, signal }, `Subprocess was killed.`)
    }
    if (code !== 0) {
      logger.info({ name, moduleName, code }, `Subprocess exited.`)
    }

    process.exit(code)
  })

  return worker
}

export default fork

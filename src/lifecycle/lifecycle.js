import { getAllWorker } from '../io/worker'
import logger from '../utils/logger'
import wait from '../utils/wait'
const WORKER_ADDED = 'WORKER_ADDED'
const WORKER_DELETED = 'WORKER_DELETED'
const WORKER_UPDATED = 'WORKER_UPDATED'

const applyWorker = (worker, context, result) => {}

const waitUntilWorkerChanges = async (context) => {
  await wait(1000)
  await new Promise((resolve) => {
    const off = () => {
      context.eventEmitter.off(WORKER_ADDED, off)
      context.eventEmitter.off(WORKER_DELETED, off)
      context.eventEmitter.off(WORKER_UPDATED, off)
      resolve()
    }
    context.eventEmitter.on(WORKER_ADDED, off)
    context.eventEmitter.on(WORKER_DELETED, off)
    context.eventEmitter.on(WORKER_UPDATED, off)
    setTimeout(() => off(), 3600000)
  })
}

const setupWorkers = async (context) => {
  const result = {
    added: 0,
    deleted: 0,
    updated: 0,
  }
  const workers = getAllWorker()
  for (const w of workers) {
    await applyWorker(w, context, result)
  }
  if (result.add + result.deleted + result.update > 0) {
    logger.info(result, 'Got workers!')
  }
}

const _watchWorkers = async (context) => {
  await setupWorkers(context)
  await waitUntilWorkerChanges(context)
  return _watchWorkers(context)
}

export const watchWorkers = async (context) => {
  logger.info('Watching for worker changes...')
  return _watchWorkers(context)
}

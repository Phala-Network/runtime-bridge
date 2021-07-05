import { createWorkerContext, destroyWorkerContext } from './worker'
import { getAllWorker } from '../io/worker'
import isEqual from 'lodash/isEqual'
import logger from '../utils/logger'
import wait from '../utils/wait'

const WORKER_ALTER = 'WORKER_ALTER'

const applyWorker = async (worker, context, result) => {
  const { workerContexts } = context
  const workerContext = workerContexts.get(worker.id)
  if (!workerContext) {
    result.added += 1
    await addWorker(worker, context)
    return
  }
  if (worker.deleted) {
    result.deleted += 1
    await deleteWorker(workerContext, context)
    return
  }
  if (!isEqual(worker, workerContext.snapshot)) {
    result.updated += 1
    await deleteWorker(workerContext, context)
    await addWorker(worker, context)
    return
  }
}

const addWorker = async (worker, context) => {
  const { id, nickname, phalaSs58Address, runtimeEndpoint } = worker
  logger.debug(
    {
      id,
      nickname,
      phalaSs58Address,
      runtimeEndpoint,
    },
    'Starting worker lifecycle.'
  )
  const ret = await createWorkerContext(worker, context)
  context.workerContexts.set(worker.id, ret)

  return ret
}

const deleteWorker = async (worker, context) => {
  await destroyWorkerContext(worker, context)
  context.workerContexts.delete(worker.id)
  const { id, nickname, phalaSs58Address, runtimeEndpoint } = worker
  logger.debug(
    {
      id,
      nickname,
      phalaSs58Address,
      runtimeEndpoint,
    },
    'Stopped worker lifecycle.'
  )
  return worker.id
}

const waitUntilWorkerChanges = async (context) => {
  await wait(6000)
  await new Promise((resolve) => {
    const off = () => {
      context.eventEmitter.off(WORKER_ALTER, off)
      resolve()
    }
    context.eventEmitter.on(WORKER_ALTER, off)
    setTimeout(() => off(), 3600000)
  })
}

const setupWorkers = async (context) => {
  // TODO: wait for db write queue being empty
  await wait(3000)
  const result = {
    added: 0,
    deleted: 0,
    updated: 0,
    _failed: 0,
  }
  const workers = await getAllWorker()
  for (const w of workers) {
    await applyWorker(w, context, result).catch((e) => {
      logger.warn(e)
      result._failed += 1
    })
  }
  if (result.added + result.deleted + result.updated > 0) {
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

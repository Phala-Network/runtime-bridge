import { UWorker } from '../io/worker'
import {
  createWorkerContext,
  destroyWorkerContext,
  getWorkerSnapshot,
} from './worker'
import isEqual from 'lodash/isEqual'
import logger from '../utils/logger'
import wait from '../utils/wait'

const WORKER_ALTER = 'WORKER_ALTER'

export const applyWorker = async (worker, context, result) => {
  const { workerContexts } = context
  const workerContext = workerContexts.get(worker.uuid)
  if (!workerContext) {
    if (!worker.deleted && worker.enabled) {
      result.added += 1
      await addWorker(worker, context)
    }
    if (worker.deleted) {
      result.deleted += 1
      await deleteWorker(workerContext, context)
      return
    }
    return
  }
  if (worker.deleted || !worker.enabled) {
    result.deleted += 1
    await deleteWorker(workerContext, context)
    return
  }
  if (!isEqual(getWorkerSnapshot(worker), workerContext.snapshotBrief)) {
    result.updated += 1
    await deleteWorker(workerContext, context)
    await addWorker(worker, context)
  }
}

export const addWorker = async (worker, context) => {
  const ret = await createWorkerContext(worker, context)
  context.workerContexts.set(worker.uuid, ret)

  return ret
}

const deleteWorker = async (worker, context) => {
  await destroyWorkerContext(context.workerContexts[worker.uuid], true)
  context.workerContexts.delete(worker.uuid)
  const { id, nickname } = worker
  logger.debug(
    {
      id,
      nickname,
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
  await wait(3000)
  const result = {
    added: 0,
    deleted: 0,
    updated: 0,
    _failed: 0,
  }
  const workers = await UWorker.getAll()
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

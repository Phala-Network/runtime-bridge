import {
  MA_ADD_BATCH,
  MA_BATCH_ADDED,
  MA_BATCH_FAILED,
  MA_BATCH_FINISHED,
  MA_BATCH_REJECTED,
  MA_BATCH_WORKING,
  MA_ERROR,
  MA_ONLINE,
} from './trader'
import PQueue from 'p-queue'
import cluster, { isMaster } from 'cluster'
import logger from '../utils/logger'
import wait from '../utils/wait'

let traderManager = null

export const TM_DOWN = Symbol('TM_DOWN')
export const TM_STARTING = Symbol('TM_STARTING')
export const TM_UP_IDLE = Symbol('TM_UP_IDLE')
export const TM_UP_WORKING = Symbol('TM_UP_WORKING')
export const TM_ERROR = Symbol('TM_ERROR')

export class TraderDownError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TraderDownError'
    this.message = 'Trader is down!'
  }
}

class TraderManager {
  #appContext
  #status = TM_DOWN
  #process = null
  #batchJobs = {}
  #currentBatchJobIds = []
  #activeBatchJobIds = []
  #currentError = null
  #addQueue

  constructor(appContext) {
    this.#appContext = appContext
    this.#addQueue = new PQueue({ concurrency: 1 })
    this.#startProcess().catch((e) => logger.warn(e))
  }

  addBatchJob(batch) {
    return this.#addQueue.add(() => this.#addBatch(batch))
  }
  async #addBatch(batch) {
    await this.waitUntilUp()
    const addedPromise = new Promise(
      (addedPromise__resolve, addedPromise__reject) => {
        Object.assign(batch, {
          addedPromise__resolve,
          addedPromise__reject,
        })
        this.#batchJobs[batch.id] = batch
        this.#process.send({
          action: MA_ADD_BATCH,
          payload: {
            id: batch.id,
            pid: batch.jobs[0].pid,
            calls: batch.calls,
          },
        })
        logger.debug({ batchId: batch.id }, 'Sent batch add request...')
      }
    )

    try {
      await addedPromise
    } catch (e) {
      if (e) {
        logger.error(e)
        batch.addedPromise__reject(e)
        batch.finishedPromise__reject(e)
      }
      await this.restartProcess()
      return this.#addBatch(batch)
    }
  }

  #onBatchJobAdded(id) {
    this.#batchJobs[id]?.addedPromise__resolve?.()
  }
  #onBatchJobRejected(id) {
    this.#batchJobs[id]?.addedPromise__reject?.()
  }
  #onBatchJobWorking(id) {
    this.#batchJobs[id]?.startedPromise__resolve()
  }
  #onBatchJobFinished(id, failedCalls) {
    const batch = this.#batchJobs[id]
    if (!batch) {
      return
    }
    const indexes = failedCalls.map((i) => batch.callToJobId[i.index])
    this.#batchJobs[id]?.finishedPromise__resolve({
      indexes,
      reasons: failedCalls,
    })
  }
  #onBatchJobFailed(id, e) {
    this.#batchJobs[id]?.startedPromise__reject(e)
    this.#batchJobs[id]?.finishedPromise__reject(e)
  }

  async #onProcessExited(code) {
    for (const id of this.#activeBatchJobIds) {
      const batch = this.#batchJobs[id]
      if (this.#currentBatchJobIds[0] === id) {
        this.#currentBatchJobIds.shift()
      }
      if (batch) {
        batch.jobs.map((j) =>
          j.startedPromise__reject(new Error(`Trader process exited: ${code}`))
        )
      }
    }
    this.#activeBatchJobIds = []
  }

  async #startProcess() {
    if (this.isStarting) {
      return await this.waitUntilUp()
    }
    if (this.isUp) {
      return true
    }
    this.#status = TM_STARTING
    logger.info('Trader starting!')
    this.#forkProcess()
    return await this.waitUntilUp()
  }

  async #stopProcess() {
    if (this.isDown) {
      return !this.hasError
    }
  }

  async restartProcess() {
    await this.#stopProcess()
    await this.#startProcess()
  }

  #forkProcess() {
    if (!isMaster) {
      throw new Error('Not a master process.')
    }
    const traderProcess = cluster.fork({
      PHALA_MODULE: 'trade/trader',
    })
    traderProcess.on('message', ({ action, payload }) => {
      switch (action) {
        case MA_ONLINE:
          this.#status = TM_UP_IDLE
          logger.info('Trader up!')
          break
        case MA_ERROR:
          this.#status = TM_ERROR
          logger.error({ payload }, 'Trader error!')
          this.#currentError = new Error(payload)
          break
        default:
          this.#handleProcessMessage({ action, payload })
          break
      }
    })
    traderProcess.on('exit', (code, signal) => {
      if (this.hasError) {
        logger.info(
          { code, signal },
          `Trader exited with error.`,
          this.#currentError
        )
      } else {
        logger.info({ code, signal }, `Trader exited.`)
        this.#status = TM_DOWN
      }
      this.#onProcessExited(signal || code)
        .then(() => this.#startProcess())
        .catch((e) => logger.warn(e))
    })
    this.#process = traderProcess
  }

  #handleProcessMessage(message) {
    logger.debug(message, 'Received from trader')
    const { action, payload } = message
    switch (action) {
      case MA_BATCH_ADDED:
        this.#onBatchJobAdded(payload.id)
        break
      case MA_BATCH_REJECTED:
        this.#onBatchJobRejected(payload.id)
        break
      case MA_BATCH_WORKING:
        this.#onBatchJobWorking(payload.id)
        break
      case MA_BATCH_FINISHED:
        this.#onBatchJobFinished(payload.id, payload.failedCalls)
        break
      case MA_BATCH_FAILED:
        this.#onBatchJobFailed(payload.id, payload.error)
        break
    }
  }

  async waitUntilUp() {
    if (this.isDown) {
      throw new TraderDownError()
    }
    if (this.isUp) {
      return true
    }
    await wait(1000)
    return await this.waitUntilUp()
  }

  get isUp() {
    return this.#status === TM_UP_IDLE || this.#status === TM_UP_WORKING
  }

  get isDown() {
    return this.#status === TM_DOWN || this.#status === TM_ERROR
  }

  get isStarting() {
    return this.#status === TM_STARTING
  }

  get isWorking() {
    return this.#status === TM_UP_WORKING
  }

  get hasError() {
    return this.#status === TM_ERROR
  }

  get error() {
    return this.#currentError
  }
}

const createTraderManager = (appContext) => {
  if (!traderManager) {
    traderManager = new TraderManager(appContext)
    Object.assign(appContext, { traderManager })
  }

  return traderManager
}

export default createTraderManager
export { traderManager }

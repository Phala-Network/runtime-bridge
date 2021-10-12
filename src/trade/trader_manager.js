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
  #firstStartedAt = 0
  #lastStartedAt = 0
  #currentBatch = null
  #currentBatchCount = 0
  #currentError = null

  constructor(appContext) {
    this.#appContext = appContext
    this.#startProcess().catch((e) => logger.warn(e))
  }

  async addBatchJob(batch) {}

  async #processBatchJob(batch) {}

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
    const process = cluster.fork({
      PHALA_MODULE: 'trade/trader',
    })
    process.on('message', ({ action, payload }) => {
      switch (action) {
        case 'online':
          this.#status = TM_UP_IDLE
          logger.info('Trader up!')
          break
        case 'error':
          this.#status = TM_ERROR
          logger.error({ payload }, 'Trader error!')
          this.#currentError = new Error(payload)
          break
      }
    })
    process.on('exit', (code, signal) => {
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
      this.#startProcess().catch((e) => logger.warn(e))
    })
    this.#process = process
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

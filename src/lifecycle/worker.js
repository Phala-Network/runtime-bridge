import { UPool } from '../io/worker'
import { keyring } from '../utils/api'
import { setupRuntime } from './pruntime'
import PQueue from 'p-queue'
import _stateMachine, { EVENTS } from './state_machine'
import logger from '../utils/logger'

export const getPool = async (pidStr, context, forceReload = false) => {
  let pool
  if (!forceReload) {
    pool = context.pools.get(pidStr)
    if (pool) {
      return pool
    }
  }
  pool = await UPool.getBy('pid', pidStr)
  const poolSnapshot = Object.freeze({
    uuid: pool.uuid,
    pid: pidStr,
    ss58Phala: pool.owner.ss58Phala,
    ss58Polkadot: pool.owner.ss58Polkadot,
  })
  pool = Object.freeze({
    ...poolSnapshot,
    pair: keyring.addFromJson(JSON.parse(pool.owner.polkadotJson)),
    poolSnapshot,
  })
  context.pools.set(pidStr, pool)
  return pool
}

export const getWorkerSnapshot = (worker) =>
  Object.freeze({
    uuid: worker.uuid,
    name: worker.name,
    endpoint: worker.endpoint,
    pid: worker.pid.toString(),
  })

export const createWorkerContext = async (worker, context) => {
  const pid = worker.pid.toString() // uint64
  const pool = await getPool(pid, context, true)
  const poolSnapshot = { pool }
  const snapshotBrief = getWorkerSnapshot(worker)
  const snapshot = Object.freeze({
    ...snapshotBrief,
    ...poolSnapshot,
  })
  const onChainState = await subscribeOnChainState(snapshot)
  const stateMachine = await _stateMachine.start()
  logger.info('Starting worker context...', snapshotBrief)

  let errorMessage = ''
  let stateMachineState = 'S_INIT'

  const innerTxQueue = new PQueue({
    concurrency: 1,
  })

  const workerContext = {
    context,
    appContext: context,
    pool,
    poolSnapshot,
    snapshot,
    snapshotBrief,
    worker: snapshot,
    workerBrief: snapshotBrief,
    onChainState,
    stateMachine,
    runtime: null,
    innerTxQueue,

    get stateMachineState() {
      return stateMachineState
    },
    set stateMachineState(state) {
      stateMachineState = state
      logger.debug(
        { workerId: worker.id, state },
        'Worker stateMachineState changed.'
      )
    },
    get errorMessage() {
      return errorMessage
    },
    set errorMessage(message) {
      errorMessage = message
    },

    dispatchTx: (...args) =>
      innerTxQueue.add(() => context.txQueue.dispatch(...args)),
    _dispatchTx: context.txQueue.dispatch,
  }

  setupRuntime(workerContext)

  stateMachine.rootStateMachine.workerContext = workerContext
  stateMachine.handle(EVENTS.SHOULD_START)

  return workerContext
}

const subscribeOnChainState = async (worker) => {
  // TODO
  return {
    worker,
    unsubscribe: async () => {},
  }
}

export const destroyWorkerContext = async (workerContext) => {
  workerContext.innerTxQueue.clear()
  await workerContext.stateMachine.handle(EVENTS.SHOULD_KICK)
  await workerContext.onChainState.unsubscribe()
  if (workerContext.runtime) {
    clearInterval(workerContext.runtime.updateInfoInterval)
    if (workerContext.runtime.stopSync) {
      workerContext.runtime.stopSync()
    }
  }
}

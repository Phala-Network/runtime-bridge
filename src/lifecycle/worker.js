import { BN_1PHA } from '../utils/constants'
import { UPool } from '../io/worker'
import { keyring, phalaApi } from '../utils/api'
import { setupRuntime } from './pruntime'
import BN from 'bn.js'
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
  const pair = keyring.addFromJson(JSON.parse(pool.owner.polkadotJson))
  pair.decodePkcs8()
  pool = Object.freeze({
    ...poolSnapshot,
    pair,
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
    stake: worker.stake || '0',
  })

export const createWorkerContext = async (worker, context) => {
  const stakeBn = new BN(worker.stake)

  if (stakeBn.lt(BN_1PHA)) {
    throw new Error('Stake amount should be at least > 1PHA!')
  }

  const pid = worker.pid.toString() // uint64
  const pool = await getPool(pid, context, true)
  const poolSnapshot = pool.poolSnapshot
  const poolOwner = pool.pair
  const snapshotBrief = getWorkerSnapshot(worker)
  const snapshot = Object.freeze({
    ...snapshotBrief,
    ...poolSnapshot,
  })
  const stateMachine = await _stateMachine.start()
  logger.info('Starting worker context...', snapshotBrief)

  const messages = []
  let stateMachineState = 'S_INIT'

  const innerTxQueue = new PQueue({
    concurrency: 1,
  })

  const workerContext = {
    context,
    appContext: context,
    pid,
    pool,
    poolSnapshot,
    poolOwner,
    snapshot,
    snapshotBrief,
    stakeBn,
    worker: snapshot,
    workerBrief: snapshotBrief,
    onChainState: null,
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
    get message() {
      if (!messages.length) {
        return ''
      }
      const m = messages[messages.length - 1]
      return `${m.timestamp} - ${m.message}`
    },
    set message(message) {
      messages.push({ message, timestamp: Date.now() })
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

export const subscribeOnChainState = async (workerContext) => {
  let shouldStop = false

  const { runtime } = workerContext
  const { initInfo } = runtime
  const publicKey = '0x' + initInfo.encodedPublicKey.toString('hex')

  const ret = {
    publicKey,
    accountId: '',
    minerInfo: null,
    _unsubscribeMinerInfo: null,
    unsubscribe: () => Promise.all(unFns.map((i) => i())),
  }

  const unFns = [
    () => {
      shouldStop = true
      ret._unsubscribeMinerInfo?.()
    },
  ]
  unFns.push(
    await phalaApi.query.phalaMining.workerBindings(
      publicKey,
      async (account) => {
        if (shouldStop) {
          return
        }
        ret.accountId = account.unwrapOrDefault().toString()
        if (account.isSome) {
          ret._unsubscribeMinerInfo?.()
          ret._unsubscribeMinerInfo = await phalaApi.query.phalaMining.miners(
            ret.accountId,
            (minerInfo) => {
              if (shouldStop) {
                ret._unsubscribeMinerInfo?.()
                return
              }
              ret.minerInfo = minerInfo.unwrapOrDefault()
              if (ret.minerInfo.state.isMiningUnresponsive) {
                workerContext.message = 'Notice: worker unresponsive!'
              }
            }
          )
        } else {
          ret.minerInfo = (
            await phalaApi.query.phalaMining.miners(ret.accountId)
          ).unwrapOrDefault()
        }
      }
    )
  )
  return ret
}

export const destroyWorkerContext = async (
  workerContext,
  shouldKick = false
) => {
  workerContext.innerTxQueue.clear()
  if (shouldKick) {
    await workerContext.stateMachine.handle(EVENTS.SHOULD_KICK)
  }
  await workerContext.onChainState?.unsubscribe?.()
  if (workerContext.runtime) {
    clearInterval(workerContext.runtime.updateInfoInterval)
    workerContext.runtime.stopSync?.()
    workerContext.runtime.stopSyncMessage?.()
  }
}

export const startMining = async (workerContext) => {
  const { pid, dispatchTx, snapshotBrief, runtime } = workerContext
  const { stake } = snapshotBrief
  const { initInfo } = runtime
  const publicKey = '0x' + initInfo.encodedPublicKey.toString('hex')
  workerContext.message = 'Starting mining on chain...'
  await dispatchTx({
    action: 'START_MINING',
    payload: {
      pid,
      publicKey,
      stake,
    },
  })
}
export const stopMining = async (workerContext) => {
  const { pid, dispatchTx, runtime } = workerContext
  const { initInfo } = runtime
  const publicKey = '0x' + initInfo.encodedPublicKey.toString('hex')
  workerContext.message = 'Stopping mining on chain...'
  await dispatchTx({
    action: 'STOP_MINING',
    payload: {
      pid,
      publicKey,
    },
  })
}

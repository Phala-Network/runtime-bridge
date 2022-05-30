import { BN_1PHA, MINER_V_BASE } from '../../utils/constants'
import { phalaApi } from '../../utils/api'
import { setupRuntime } from './pruntime'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import PQueue from 'p-queue'
import _stateMachine, { EVENTS } from './state_machine'
import logger from '../../utils/logger'

export const createWorkerContext = async (worker, context, forceRa = false) => {
  const stakeBn = new BN(worker.stake)

  if (stakeBn.lt(BN_1PHA)) {
    throw new Error('Stake amount should be at least > 1PHA!')
  }

  const pid = worker.pool.pid.toString() // uint64
  const pool = worker.pool
  const poolSnapshot = pool.toPbInterface()
  const poolOwner = pool.operator
  const snapshotBrief = worker.toPbInterface()
  const snapshot = Object.freeze({
    ...poolSnapshot,
    ...snapshotBrief,
  })
  const stateMachine = _stateMachine.start()
  logger.debug('Starting worker context...', snapshotBrief)

  const messages = []
  let stateMachineState = 'S_INIT'

  const innerTxQueue = new PQueue({
    concurrency: 1,
  })

  const workerContext = {
    _worker: worker,
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
    forceRa,

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
  const { info } = runtime
  const publicKey = '0x' + info.publicKey

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
              const _minerInfo = minerInfo.unwrapOrDefault()
              _minerInfo.humanReadable = {
                ..._minerInfo.toHuman(),
                v: new Decimal(_minerInfo?.v?.toJSON() || '0')
                  .div(MINER_V_BASE)
                  .toFixed(8),
                ve: new Decimal(_minerInfo?.ve?.toJSON() || '0')
                  .div(MINER_V_BASE)
                  .toFixed(8),
                stats: {
                  totalReward: _minerInfo
                    ? phalaApi
                        .createType('BalanceOf', _minerInfo.stats.totalReward)
                        .toHuman()
                    : '0',
                },
                raw: _minerInfo,
                runtimeInfo: info,
              }
              ret.minerInfo = _minerInfo
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
    workerContext.runtime.shouldStopUpdateInfo = true
    workerContext.runtime.stopSync?.()
    workerContext.runtime.stopSyncMessage?.()
  }
}

export const startMining = async (workerContext) => {
  const { pid, dispatchTx, snapshotBrief, runtime } = workerContext
  const { stake } = snapshotBrief
  const { info } = runtime
  const publicKey = '0x' + info.publicKey
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
  const { info } = runtime
  const publicKey = '0x' + info.publicKey
  workerContext.message = 'Stopping mining on chain...'
  await dispatchTx({
    action: 'STOP_MINING',
    payload: {
      pid,
      publicKey,
    },
  })
}

export const getWorkerStates = (ids, workers) => {
  const ret = {}
  for (const id of ids) {
    const w = workers[id]
    const { runtimeInfo, info, syncStatus } = w?.runtime || {}
    ret[id] = {
      status: w?.stateMachineState,
      initialized: info?.initialized,
      parentHeaderSynchedTo: syncStatus?.parentHeaderSynchedTo,
      paraHeaderSynchedTo: syncStatus?.paraHeaderSynchedTo,
      paraBlockDispatchedTo: syncStatus?.paraBlockDispatchedTo,
      worker: w?.snapshotBrief,
      publicKey: runtimeInfo?.publicKey,
      lastMessage: w?.message,
      minerAccountId: w?.onChainState?.accountId?.toString(),
      minerInfoJson: JSON.stringify(
        w?.onChainState?.minerInfo?.humanReadable || {
          runtimeInfo: info || {},
        },
        null,
        2
      ),
    }
  }
  return ret
}

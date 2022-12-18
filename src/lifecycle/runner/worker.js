import { BN_1PHA, MINER_V_BASE } from '../../utils/constants'
import { phalaApi } from '../../utils/api'
import { setupRuntime } from './pruntime'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import PQueue from 'p-queue'
import _stateMachine, { EVENTS } from './state_machine'
import dayjs from 'dayjs'
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
      return `[${dayjs(m.timestamp).format()}] ${m.message}`
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
    sessionInfo: null,
    _unsubscribeSessionInfo: null,
    unsubscribe: () => Promise.all(unFns.map((i) => i())),
  }

  const unFns = [
    () => {
      shouldStop = true
      ret._unsubscribeSessionInfo?.()
    },
  ]
  unFns.push(
    await phalaApi.query.phalaComputation.workerBindings(
      publicKey,
      async (account) => {
        if (shouldStop) {
          return
        }
        ret.accountId = account.unwrapOrDefault().toString()
        if (account.isSome) {
          ret._unsubscribeSessionInfo?.()
          ret._unsubscribeSessionInfo =
            await phalaApi.query.phalaComputation.sessions(
              ret.accountId,
              (sessionInfo) => {
                if (shouldStop) {
                  ret._unsubscribeSessionInfo?.()
                  return
                }
                const _sessionInfo = sessionInfo.unwrapOrDefault()
                _sessionInfo.humanReadable = {
                  ..._sessionInfo.toHuman(),
                  v: new Decimal(_sessionInfo?.v?.toJSON() || '0')
                    .div(MINER_V_BASE)
                    .toFixed(8),
                  ve: new Decimal(_sessionInfo?.ve?.toJSON() || '0')
                    .div(MINER_V_BASE)
                    .toFixed(8),
                  stats: {
                    totalReward: _sessionInfo
                      ? phalaApi
                          .createType(
                            'BalanceOf',
                            _sessionInfo.stats.totalReward
                          )
                          .toHuman()
                      : '0',
                  },
                  raw: _sessionInfo,
                  runtimeInfo: info,
                }
                ret.sessionInfo = _sessionInfo
                if (ret.sessionInfo.state.isMiningUnresponsive) {
                  workerContext.message = 'Notice: worker unresponsive!'
                }
              }
            )
        } else {
          ret.sessionInfo = (
            await phalaApi.query.phalaComputation.sessions(ret.accountId)
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
  workerContext.message = 'Stopping worker on chain...'
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
      workerAccountId: w?.onChainState?.accountId?.toString(),
      sessionInfoJson: JSON.stringify(
        w?.onChainState?.sessionInfo?.humanReadable || {
          runtimeInfo: info || {},
        },
        null,
        2
      ),
    }
  }
  return ret
}

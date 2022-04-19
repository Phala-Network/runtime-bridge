import {
  destroyWorkerContext,
  startMining,
  subscribeOnChainState,
} from './worker'
import {
  syncOnly as globalSyncOnly,
  minBenchScore,
  shouldSkipRa,
  useLegacySync,
} from '../env'
import { initRuntime, registerWorker } from './pruntime'
import { phalaApi } from '../../utils/api'
import { prb } from '@phala/runtime-bridge-walkie'
import { startSync as startSeparatedSync } from './separated_sync'
import { startSync as startSingleSync } from './single_sync'
import { startSyncMessage } from './message'
import BN from 'bn.js'
import Finity from 'finity'
import logger from '../../utils/logger'
import toEnum from '../../utils/to_enum'
import wait from '../../utils/wait'
const Status = prb.WorkerState.Status
const StatusEnumValues = toEnum(Object.keys(Status))

export const EVENTS = toEnum([
  'SHOULD_START',
  'SHOULD_MARK_SYNCHING',
  'SHOULD_MARK_SYNCHED',
  'SHOULD_MARK_PRE_MINING',
  'SHOULD_MARK_MINING',
  'SHOULD_KICK',
  'ERROR',
])

const wrapEventAction = (fn) => (fromState, toState, context) =>
  fn(fromState, toState, context).catch((error) => {
    if (fromState === StatusEnumValues.S_ERROR && fromState === toState) {
      logger.error({ fromState, toState }, error)
      return
    }
    context.stateMachine.handle(EVENTS.ERROR, error)
  })

const onStarting = async (fromState, toState, context) => {
  const { pid, snapshotBrief, runtime, innerTxQueue } =
    context.stateMachine.rootStateMachine.workerContext

  await innerTxQueue.add(async () => {
    if (shouldSkipRa) {
      logger.warn(
        snapshotBrief,
        'Requesting to force refreshing RA report is ignored when `forceRa` is enabled. '
      )
      return initRuntime(
        runtime,
        '0000000000000000000000000000000000000000000000000000000000000001',
        true
      )
    } else {
      return initRuntime(runtime, undefined, false)
    }
  })

  const currentPool = await phalaApi.query.phalaStakePool.workerAssignments(
    '0x' + runtime.info.publicKey
  )
  if (currentPool.isSome && currentPool.toString() !== pid) {
    throw new Error('Worker is assigned to other pool!')
  }

  context.stateMachine.rootStateMachine.workerContext.onChainState =
    await subscribeOnChainState(
      context.stateMachine.rootStateMachine.workerContext
    )

  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHING)
}

const onSynching = async (fromState, toState, context) => {
  const { runtime, workerBrief } =
    context.stateMachine.rootStateMachine.workerContext

  const waitUntilSynched = useLegacySync
    ? startSeparatedSync(runtime)
    : startSingleSync(runtime)
  context.stateMachine.rootStateMachine.workerContext.message =
    'Synching block data...'
  logger.debug(workerBrief, 'Synching block data...')
  await waitUntilSynched()

  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHED)
}

const onSynched = async (fromState, toState, context) => {
  const { runtime, workerBrief, poolSnapshot, _worker, onChainState, forceRa } =
    context.stateMachine.rootStateMachine.workerContext

  if (forceRa) {
    context.stateMachine.rootStateMachine.workerContext.message =
      'forceRa detected.'
    logger.info(workerBrief, 'forceRa detected.')
    await registerWorker(runtime, true)
    context.stateMachine.rootStateMachine.workerContext.message =
      'Re-register done.'
    logger.info(workerBrief, 'Re-register done.')
  }

  if (onChainState.minerInfo.state.isMiningCoolingDown) {
    context.stateMachine.rootStateMachine.workerContext.message =
      'Worker is cooling down, skipping on-chain operations.'
    return
  }

  if (globalSyncOnly || poolSnapshot.syncOnly || _worker.syncOnly) {
    context.stateMachine.rootStateMachine.workerContext.message =
      'Sync only mode enabled, skipping on-chain operations.'
    return
  }
  const waitUntilMqSynched = startSyncMessage(runtime)
  context.stateMachine.rootStateMachine.workerContext.message =
    'Synching message queue...'
  logger.debug(workerBrief, 'Synching message queue...')
  await waitUntilMqSynched()
  context.stateMachine.rootStateMachine.workerContext.message =
    'Message queue synched.'
  logger.debug(workerBrief, 'Message queue synched.')
  context.stateMachine.handle(EVENTS.SHOULD_MARK_PRE_MINING)
}

const onPreMining = async (fromState, toState, context) => {
  const { runtime, onChainState, snapshotBrief, dispatchTx, pid } =
    context.stateMachine.rootStateMachine.workerContext
  const { info } = runtime
  const publicKey = '0x' + info.publicKey

  await wait(12000) // wait for onChainState to be synched
  await registerWorker(runtime)

  if (
    onChainState.minerInfo.state.isMiningIdle ||
    onChainState.minerInfo.state.isMiningActive ||
    onChainState.minerInfo.state.isMiningUnresponsive
  ) {
    const onChainStakeBn = new BN(
      (
        await phalaApi.query.phalaMining.stakes(
          (
            await phalaApi.query.phalaMining.workerBindings(publicKey)
          ).unwrapOrDefault()
        )
      ).toString()
    )
    const nextStakeBn = new BN(snapshotBrief.stake)
    if (nextStakeBn.gt(onChainStakeBn)) {
      context.stateMachine.rootStateMachine.workerContext.message =
        'Updating stake on chain...'
      await dispatchTx({
        action: 'RESTART_MINING',
        payload: {
          pid,
          publicKey,
          stake: snapshotBrief.stake,
        },
      })
    }
    context.stateMachine.handle(EVENTS.SHOULD_MARK_MINING)
    return
  }

  if (!runtime.skipRa) {
    context.stateMachine.rootStateMachine.workerContext.message =
      'Waiting until worker ready...'
    const waitUntilWorkerReady = async () => {
      if (onChainState.minerInfo.state.isReady) {
        return
      }
      await wait(12000)
      return await waitUntilWorkerReady()
    }
    await waitUntilWorkerReady()
    context.stateMachine.rootStateMachine.workerContext.message =
      'Starting mining on chain...'
    await startMining(context.stateMachine.rootStateMachine.workerContext)
  }

  context.stateMachine.handle(EVENTS.SHOULD_MARK_MINING)
}

const onMining = async (fromState, toState, context) => {
  context.stateMachine.rootStateMachine.workerContext.message =
    'Now the worker should be mining.'
  // Gracefully do nothing.
}

const onError = async (fromState, toState, context) => {
  context.stateMachine.rootStateMachine.workerContext.message = JSON.stringify(
    context.eventPayload instanceof Error
      ? context.eventPayload.toString()
      : context.eventPayload?.message || context.eventPayload
  )

  if (fromState === toState) {
    return
  }

  const { snapshotBrief } = context.stateMachine.rootStateMachine.workerContext

  await destroyWorkerContext(
    context.stateMachine.rootStateMachine.workerContext,
    false
  )

  logger.error(snapshotBrief, context.eventPayload)
  context.stateMachine.rootStateMachine.workerContext.message = JSON.stringify(
    context.eventPayload instanceof Error
      ? context.eventPayload.toString()
      : context.eventPayload?.message || context.eventPayload
  )
}
const onKicked = async (fromState, toState, context) => {
  if (fromState === toState) {
    return
  }
  const { runtime, snapshotBrief } =
    context.stateMachine.rootStateMachine.workerContext

  await destroyWorkerContext(
    context.stateMachine.rootStateMachine.workerContext,
    false
  )

  runtime.request('/kick').catch((e) => {
    logger.info(snapshotBrief, 'Worker kicked!', e)
  })
}

const onStateTransition = async (fromState, toState, context) => {
  const { workerBrief } = context.stateMachine.rootStateMachine.workerContext
  context.stateMachine.rootStateMachine.workerContext.message = `State changed from ${fromState} to ${toState}`
  logger.debug(workerBrief, 'State changed.')
  context.stateMachine.rootStateMachine.workerContext.stateMachineState =
    toState
}

const wrapStateMachineStateError = (state) =>
  state
    .on(EVENTS.ERROR)
    .transitionTo(StatusEnumValues.S_ERROR)
    .withAction(wrapEventAction(onError))
    .on(EVENTS.SHOULD_KICK)
    .transitionTo(StatusEnumValues.S_KICKED)
    .withAction(wrapEventAction(onKicked))

const wrapStateMachineState = (
  stateMachine,
  _state,
  on,
  transitionTo,
  withAction,
  initial = false
) => {
  const state = initial
    ? stateMachine.initialState(_state)
    : stateMachine.state(_state)
  wrapStateMachineStateError(
    state
      .on(on)
      .transitionTo(transitionTo)
      .withAction(wrapEventAction(withAction))
  )

  return stateMachine
}

const stateMachine = Finity.configure()

wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_IDLE,
  EVENTS.SHOULD_START,
  StatusEnumValues.S_STARTING,
  onStarting,
  true
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_STARTING,
  EVENTS.SHOULD_MARK_SYNCHING,
  StatusEnumValues.S_SYNCHING,
  onSynching
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_SYNCHING,
  EVENTS.SHOULD_MARK_SYNCHED,
  StatusEnumValues.S_SYNCHED,
  onSynched
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_SYNCHED,
  EVENTS.SHOULD_MARK_PRE_MINING,
  StatusEnumValues.S_PRE_MINING,
  onPreMining
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_PRE_MINING,
  EVENTS.SHOULD_MARK_MINING,
  StatusEnumValues.S_MINING,
  onMining
)

wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_MINING))
wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_KICKED))
wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_ERROR))

stateMachine.global().onTransition(wrapEventAction(onStateTransition))

export { stateMachine }
export default stateMachine

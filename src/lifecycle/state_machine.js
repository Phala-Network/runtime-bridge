import {
  destroyWorkerContext,
  startMining,
  stopMining,
  subscribeOnChainState,
} from './worker'
import {
  initRuntime,
  registerWorker,
  startSyncBlob,
  startSyncMessage,
} from './pruntime'
import { phalaApi } from '../utils/api'
import { prb } from '../message/proto'
import { serializeError } from 'serialize-error'
import { shouldSkipRa } from '../utils/env'
import Finity from 'finity'
import logger from '../utils/logger'
import toEnum from '../utils/to_enum'
import wait from '../utils/wait'
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
      $logger.error({ fromState, toState }, error)
      return
    }
    context.stateMachine.handle(EVENTS.ERROR, error)
  })

const onStarting = async (fromState, toState, context) => {
  const { pid, runtime, innerTxQueue } =
    context.stateMachine.rootStateMachine.workerContext

  const initInfo = await innerTxQueue.add(async () => {
    if (shouldSkipRa) {
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
    new Uint8Array(initInfo.publicKey)
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

  const waitUntilSynched = await startSyncBlob(runtime)
  await waitUntilSynched()
  context.stateMachine.rootStateMachine.workerContext.message =
    'waitUntilSynched done.'
  logger.info(workerBrief, 'waitUntilSynched done.')
  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHED)
}

const onSynched = async (fromState, toState, context) => {
  const { runtime, workerBrief } =
    context.stateMachine.rootStateMachine.workerContext
  const waitUntilMqSynched = await startSyncMessage(runtime)
  await waitUntilMqSynched()
  context.stateMachine.rootStateMachine.workerContext.message =
    'waitUntilMqSynched done.'
  logger.info(workerBrief, 'waitUntilMqSynched done.')
  context.stateMachine.handle(EVENTS.SHOULD_MARK_PRE_MINING)
}

const onPreMining = async (fromState, toState, context) => {
  const { runtime, onChainState } =
    context.stateMachine.rootStateMachine.workerContext
  const { initInfo, rpcClient } = runtime

  await wait(12000) // wait for onChainState to be synched
  if (
    onChainState.minerInfo.state.isMiningIdle ||
    onChainState.minerInfo.state.isMiningActive ||
    onChainState.minerInfo.state.isMiningUnresponsive
  ) {
    context.stateMachine.handle(EVENTS.SHOULD_MARK_MINING)
    return
  }

  context.stateMachine.rootStateMachine.workerContext.message =
    'Ensuring registration on chain...'
  let res = await rpcClient.getRuntimeInfo({})
  res = res.constructor.toObject(res, {
    defaults: true,
    enums: String,
    longs: Number,
  })
  Object.assign(initInfo, res)

  await registerWorker(runtime, true)
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
      ? serializeError(context.eventPayload)
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
  stopMining(context.stateMachine.rootStateMachine.workerContext).catch((e) => {
    logger.warn(snapshotBrief, e)
  })
  context.stateMachine.rootStateMachine.workerContext.message = JSON.stringify(
    context.eventPayload instanceof Error
      ? serializeError(context.eventPayload)
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

  stopMining(context.stateMachine.rootStateMachine.workerContext).catch((e) => {
    logger.warn(snapshotBrief, e)
  })
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
    .on(EVENTS.KICK)
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

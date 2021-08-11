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
import { startMining } from './worker'
import Finity from 'finity'
import logger from '../utils/logger'
import toEnum from '../utils/to_enum'
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
  const {
    pid,
    runtime,
    innerTxQueue,
  } = context.stateMachine.rootStateMachine.workerContext

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

  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHING)
}

const onSynching = async (fromState, toState, context) => {
  const {
    runtime,
    workerBrief,
  } = context.stateMachine.rootStateMachine.workerContext

  const waitUntilSynched = await startSyncBlob(runtime)
  await waitUntilSynched()
  context.stateMachine.rootStateMachine.workerContext.errorMessage =
    'waitUntilSynched done.'
  logger.info(workerBrief, 'waitUntilSynched done.')
  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHED)
}

const onSynched = async (fromState, toState, context) => {
  const {
    runtime,
    workerBrief,
  } = context.stateMachine.rootStateMachine.workerContext
  const waitUntilMqSynched = await startSyncMessage(runtime)
  await waitUntilMqSynched()
  context.stateMachine.rootStateMachine.workerContext.errorMessage =
    'waitUntilMqSynched done.'
  logger.info(workerBrief, 'waitUntilMqSynched done.')
  context.stateMachine.handle(EVENTS.SHOULD_MARK_PRE_MINING)
}

const onPreMining = async (fromState, toState, context) => {
  const { runtime } = context.stateMachine.rootStateMachine.workerContext
  const { initInfo, rpcClient } = runtime
  context.stateMachine.rootStateMachine.workerContext.errorMessage =
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
    context.stateMachine.rootStateMachine.workerContext.errorMessage =
      'Starting mining on chain...'
    await startMining(context.stateMachine.rootStateMachine.workerContext)
  }
  context.stateMachine.handle(EVENTS.SHOULD_MARK_MINING)
}

const onMining = async (fromState, toState, context) => {
  context.stateMachine.rootStateMachine.workerContext.errorMessage =
    'Now the worker should be mining.'
  // Gracefully do nothing.
}

const onError = async (fromState, toState, context) => {
  context.stateMachine.rootStateMachine.workerContext.errorMessage = JSON.stringify(
    context.eventPayload instanceof Error
      ? serializeError(context.eventPayload)
      : context.eventPayload?.message || context.eventPayload
  )

  if (fromState === toState) {
    return
  }

  const {
    worker,
    runtime,
  } = context.stateMachine.rootStateMachine.workerContext

  runtime?.stopSync?.()
  runtime?.stopSyncMessage?.()
  clearInterval(runtime.updateInfoInterval)

  logger.error(
    {
      fromState,
      toState,
      workerId: worker.id,
      phalaSs58Address: worker.phalaSs58Address,
    },
    context.eventPayload
  )
  // if (workerState === 'Mining' || workerState === 'MiningPending') {
  //   dispatchTx({
  //     action: 'STOP_MINING_INTENTION',
  //     payload: {
  //       worker,
  //     },
  //   }).catch((e) => {
  //     logger.warn(
  //       {
  //         fromState,
  //         toState,
  //         workerId: worker.id,
  //         phalaSs58Address: worker.phalaSs58Address,
  //       },
  //       e
  //     )
  //   })
  // }
}
const onKicked = async (fromState, toState, context) => {
  if (fromState === toState) {
    return
  }
  const { runtime } = context.stateMachine.rootStateMachine.workerContext

  runtime?.stopSync?.()
  runtime?.stopSyncMessage?.()
  clearInterval(runtime.updateInfoInterval)

  // if (workerState === 'Mining' || workerState === 'MiningPending') {
  //   await dispatchTx({
  //     action: 'STOP_MINING_INTENTION',
  //     payload: {
  //       worker,ti
  //     },
  //   })
  // }
  await runtime.request('/kick')
}

const onStateTransition = async (fromState, toState, context) => {
  const { workerBrief } = context.stateMachine.rootStateMachine.workerContext
  context.stateMachine.rootStateMachine.workerContext.errorMessage = `State changed from ${fromState} to ${toState}`
  logger.debug(workerBrief, 'State changed.')
  context.stateMachine.rootStateMachine.workerContext.stateMachineState = toState
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

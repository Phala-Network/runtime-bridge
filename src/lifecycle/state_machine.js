import { MINIUM_BALANCE } from '../utils/constants'
import { initRuntime, startSync } from './pruntime'
import { protoRoot } from '../message/proto'
import Finity from 'finity'
import logger from '../utils/logger'
import toEnum from '../utils/to_enum'
const Status = protoRoot.lookupEnum('WorkerState.Status')
const StatusEnumValues = toEnum(Object.keys(Status.values))

export const EVENTS = toEnum([
  'SHOULD_START',
  'SHOULD_MARK_PENDING_SYNCHING',
  'SHOULD_MARK_SYNCHING',
  'SHOULD_MARK_ONLINE',
  'SHOULD_KICK',
  'ERROR',
])

const setAccount = async (dispatchTx, worker, state) => {
  if (state.controllerAddress !== worker.phalaSs58Address) {
    await dispatchTx({
      action: 'SET_STASH',
      payload: {
        address: worker.phalaSs58Address,
        worker,
      },
    })
  }
  if (state.payoutAddress !== worker.payoutAddress) {
    await dispatchTx({
      action: 'SET_PAYOUT_PREFS',
      payload: {
        target: worker.payoutAddress,
        worker,
      },
    })
  }
}

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
    dispatchTx,
    onChainState,
    worker,
  } = context.stateMachine.rootStateMachine.workerContext
  const { balance } = onChainState

  if (!balance.gte(MINIUM_BALANCE)) {
    context.stateMachine.handle(
      EVENTS.ERROR,
      'Balance must be greater than 10000 PHA!'
    )
    return
  }
  await setAccount(dispatchTx, worker, onChainState)
  context.stateMachine.handle(EVENTS.SHOULD_MARK_PENDING_SYNCHING)
}
const onPendingSynching = async (fromState, toState, context) => {
  const {
    runtime,
    innerTxQueue,
  } = context.stateMachine.rootStateMachine.workerContext
  await innerTxQueue.add(async () => {
    await initRuntime(runtime)
  })

  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHING)
}
const onSynching = async (fromState, toState, context) => {
  const {
    runtime,
    dispatchTx,
    worker,
    workerBrief,
  } = context.stateMachine.rootStateMachine.workerContext

  const waitUntilSynched = await startSync(runtime)
  await waitUntilSynched()
  logger.info(workerBrief, 'waitUntilSynched done.')
  await dispatchTx({
    action: 'START_MINING_INTENTION',
    payload: {
      worker,
    },
  })

  context.stateMachine.handle(EVENTS.SHOULD_MARK_ONLINE)
}
const onOnline = async (fromState, toState, context) => {
  const { runtime } = context.stateMachine.rootStateMachine.workerContext
  await runtime.startSyncWorkerIngress()
}
const onError = async (fromState, toState, context) => {
  context.stateMachine.rootStateMachine.workerContext.errorMessage =
    context.eventPayload

  if (fromState === toState) {
    return
  }

  const {
    worker,
    onChainState: { workerState },
    dispatchTx,
  } = context.stateMachine.rootStateMachine.workerContext
  logger.error(
    {
      fromState,
      toState,
      workerId: worker.id,
      phalaSs58Address: worker.phalaSs58Address,
    },
    context.eventPayload
  )
  if (workerState === 'Mining' || workerState === 'MiningPending') {
    dispatchTx({
      action: 'STOP_MINING_INTENTION',
      payload: {
        worker,
      },
    }).catch((e) => {
      logger.warn(
        {
          fromState,
          toState,
          workerId: worker.id,
          phalaSs58Address: worker.phalaSs58Address,
        },
        e
      )
    })
  }
}
const onKicked = async (fromState, toState, context) => {
  if (fromState === toState) {
    return
  }
  const {
    worker,
    onChainState: { workerState },
    dispatchTx,
    runtime,
  } = context.stateMachine.rootStateMachine.workerContext
  if (workerState === 'Mining' || workerState === 'MiningPending') {
    await dispatchTx({
      action: 'STOP_MINING_INTENTION',
      payload: {
        worker,
      },
    })
  }
  await runtime.request('/kick')
  // todo: send /kick to pruntime
}

const onStateTransition = async (fromState, toState, context) => {
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
  EVENTS.SHOULD_MARK_PENDING_SYNCHING,
  StatusEnumValues.S_PENDING_SYNCHING,
  onPendingSynching
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_PENDING_SYNCHING,
  EVENTS.SHOULD_MARK_SYNCHING,
  StatusEnumValues.S_SYNCHING,
  onSynching
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_SYNCHING,
  EVENTS.SHOULD_MARK_ONLINE,
  StatusEnumValues.S_ONLINE,
  onOnline
)
wrapStateMachineState(
  stateMachine,
  StatusEnumValues.S_SYNCHING,
  EVENTS.SHOULD_MARK_ONLINE,
  StatusEnumValues.S_ONLINE,
  onOnline
)
wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_ONLINE))
wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_KICKED))
wrapStateMachineStateError(stateMachine.state(StatusEnumValues.S_ERROR))

stateMachine.global().onTransition(wrapEventAction(onStateTransition))

export { stateMachine }
export default stateMachine

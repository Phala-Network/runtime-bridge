import Finity from 'finity'
import toEnum from '@/utils/to_enum'
import { protoRoot } from '@/message/proto'
import PRuntime from './pruntime'

const Status = protoRoot.lookupEnum('WorkerState.Status')
const StatusEnumValues = Status.values

const EVENTS = toEnum([
  'SHOULD_START',
  'SHOULD_MARK_PENDING_SYNCHING',
  'SHOULD_MARK_SYNCHING',
  'SHOULD_MARK_ONLINE',
  'SHOULD_KICK',
  'ERROR',
])

const onStarting = async (fromState, toState, context) => {
  const phalaApi = context.stateMachine.workerContext.phalaApi
  // todo: check balance and throw error
  // todo: check payout address
  // todo: set payout address when not correct
}
const onPendingSynching = () => {
  // todo: init pruntime
}
const onSynching = () => {
  // todo: intervally check then set intention
}
const onOnline = () => {
  // gracefully do nothing
}
const onError = () => {
  // todo: write last error message to db
}
const onKicked = () => {
  // todo: send /kick to pruntime
}
const onStateTransition = () => {
  // todo: update status in db
}

const stateMachine = Finity.configure()

stateMachine
  .initialState(StatusEnumValues.S_IDLE)
  .on(EVENTS.SHOULD_START)
  .transitionTo(StatusEnumValues.S_STARTING)
  .withAction(onStarting)
  .on(StatusEnumValues.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(onError)
  .on(StatusEnumValues.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(onKicked)
stateMachine
  .state(StatusEnumValues.S_STARTING)
  .on(EVENTS.SHOULD_MARK_PENDING_SYNCHING)
  .transitionTo(StatusEnumValues.S_PENDING_SYNCHING)
  .withAction(onPendingSynching)
  .on(StatusEnumValues.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(onError)
  .on(StatusEnumValues.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(onKicked)
stateMachine
  .state(StatusEnumValues.S_PENDING_SYNCHING)
  .on(EVENTS.SHOULD_MARK_SYNCHING)
  .transitionTo(StatusEnumValues.S_SYNCHING)
  .withAction(onSynching)
  .on(StatusEnumValues.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(onError)
  .on(StatusEnumValues.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(onKicked)
stateMachine
  .state(StatusEnumValues.S_SYNCHING)
  .on(EVENTS.SHOULD_MARK_ONLINE)
  .transitionTo(StatusEnumValues.S_ONLINE)
  .withAction(onOnline)
  .on(StatusEnumValues.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(onError)
  .on(StatusEnumValues.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(onKicked)
stateMachine
  .state(StatusEnumValues.S_ONLINE)
  .on(StatusEnumValues.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(onError)
  .on(StatusEnumValues.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(onKicked)
stateMachine.state(StatusEnumValues.S_KICKED)
stateMachine.state(StatusEnumValues.S_ERROR)
stateMachine.global().onTransition(onStateTransition)

const createWorkerState = (options) => {
  // todo: queue polkadotjs queries
  const pruntime = new PRuntime({
    ...options.context,
    machine: options.machine,
  })
  const sm = stateMachine.start()
  sm.workerContext = options
  sm.workerContext.pruntime = pruntime
  sm.handle(EVENTS.SHOULD_START)
  return sm
}

export { createWorkerState }

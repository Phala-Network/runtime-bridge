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

const createWorkerState = async (options) => {
  const WorkerState = options.ottoman.getModel('WorkerState')
  const stateId = WorkerState.findOneAndUpdate(
    { workerId: options.machine.id },
    {
      workerId: options.machine.id,
      status: 'S_IDLE',
      balance: { value: '0' },
    },
    {
      new: true,
      strict: false,
      upsert: true,
    }
  )
  const state = await WorkerState.findById(stateId)
  const pruntime = new PRuntime({
    ...options.context,
    machine: options.machine,
    stateId,
    state,
  })

  const unsubBalancePromise = options.phalaApi.query.system.account(
    options.machine.phalaSs58Address,
    ({ data: { free: currentFree } }) =>
      (async () => {
        state._applyData({
          balance: {
            value: currentFree.toString(),
          },
        })
        await state.save()
      })()
  )
  const unsubStashStatePromise = options.phalaApi.query.phala.stashState(
    options.machine.phalaSs58Address,
    ({ payoutPrefs: { target } }) =>
      (async () => {
        state._applyData({
          balance: {
            value: target.toString(),
          },
        })
        await state.save()
      })()
  )
  const unsubWorkerStatePromise = options.phalaApi.query.phala.workerState(
    options.machine.phalaSs58Address,
    ({ state: _workerState }) =>
      (async () => {
        const workerState = Object.keys(_workerState.toJSON())[0]
        state._applyData({ workerState })
        await state.save()
      })()
  )

  const destroy = async () =>
    Promise.all(
      (
        await Promise.all([
          unsubBalancePromise,
          unsubStashStatePromise,
          unsubWorkerStatePromise,
        ])
      ).map((unsub) => unsub())
    )

  const sm = stateMachine.start()
  sm.workerContext = options
  sm.workerContext.pruntime = pruntime
  sm.workerContext.stateId = stateId
  sm.workerContext.state = state
  sm.workerContext.destroy = destroy

  sm.handle(EVENTS.SHOULD_START)

  return sm
}

export { createWorkerState }

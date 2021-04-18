import Finity from 'finity'
import { getModel } from 'ottoman'
import toEnum from '../utils/to_enum'
import { protoRoot } from '../message/proto'
import PRuntime from './pruntime'
import { MINIUM_BALANCE } from '../utils/constants'
import BN from 'bn.js'
import _PQueue from 'p-queue'

const PQueue = _PQueue.default

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

const setAccount = async (dispatchTx, machine, state) => {
  if (state.controller !== machine.phalaSs58Address) {
    await dispatchTx({
      action: 'SET_STASH',
      payload: {
        address: machine.phalaSs58Address,
        machineRecordId: machine.id,
      },
    })
  }
  if (state.payoutAddress !== machine.payoutAddress) {
    await dispatchTx({
      action: 'SET_PAYOUT_PREFS',
      payload: {
        target: machine.payoutAddress,
        machineRecordId: machine.id,
      },
    })
  }
}

const wrapEventAction = (fn) => (fromState, toState, context) => {
  return fn(fromState, toState, context).catch((error) => {
    $logger.error({ fromState, toState }, error)
    context.stateMachine.handle(EVENTS.ERROR, error)
  })
}

const onStarting = async (fromState, toState, context) => {
  // todo: check balance and throw error
  // todo: check payout address
  // todo: set payout address when not correct
  const {
    dispatchTx,
    state,
    machine,
  } = context.stateMachine.rootStateMachine.workerContext
  const {
    balance: { value: balanceString },
  } = state

  const balance = new BN(balanceString)
  if (!balance.gte(MINIUM_BALANCE)) {
    context.stateMachine.handle(
      EVENTS.ERROR,
      'Balance must be greater than 10000 PHA!'
    )
    return
  }
  await setAccount(dispatchTx, machine, state)
  context.stateMachine.handle(EVENTS.SHOULD_MARK_PENDING_SYNCHING)
}
const onPendingSynching = async (fromState, toState, context) => {
  const {
    pruntime,
    updateState,
  } = context.stateMachine.rootStateMachine.workerContext
  await pruntime.initRuntime()
  await updateState({
    initialized: true,
  })

  context.stateMachine.handle(EVENTS.SHOULD_MARK_SYNCHING)
}
const onSynching = (romState, toState, context) => {
  console.log(1)
  context.stateMachine.rootStateMachine.workerContext.pruntime.startSendBlob()
  console.log(2)
  // todo: intervally check then set intention
}
const onOnline = () => {
  // gracefully do nothing
}
const onError = () => {
  console.log('error!')
  // todo: write last error message to db
}
const onKicked = () => {
  // todo: send /kick to pruntime
}

const onStateTransition = (fromState, toState, context) => {
  const { updateState } = context.stateMachine.rootStateMachine.workerContext
  return updateState({
    status: Status.valuesById[toState],
  }).catch($logger.error)
}

const stateMachine = Finity.configure()

stateMachine
  .initialState(StatusEnumValues.S_IDLE)
  .on(EVENTS.SHOULD_START)
  .transitionTo(StatusEnumValues.S_STARTING)
  .withAction(wrapEventAction(onStarting))
  .on(EVENTS.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(wrapEventAction(onError))
  .on(EVENTS.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(wrapEventAction(onKicked))
stateMachine
  .state(StatusEnumValues.S_STARTING)
  .on(EVENTS.SHOULD_MARK_PENDING_SYNCHING)
  .transitionTo(StatusEnumValues.S_PENDING_SYNCHING)
  .withAction(wrapEventAction(onPendingSynching))
  .on(EVENTS.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(wrapEventAction(onError))
  .on(EVENTS.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(wrapEventAction(onKicked))
stateMachine
  .state(StatusEnumValues.S_PENDING_SYNCHING)
  .on(EVENTS.SHOULD_MARK_SYNCHING)
  .transitionTo(StatusEnumValues.S_SYNCHING)
  .withAction(wrapEventAction(onSynching))
  .on(EVENTS.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(wrapEventAction(onError))
  .on(EVENTS.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(wrapEventAction(onKicked))
stateMachine
  .state(StatusEnumValues.S_SYNCHING)
  .on(EVENTS.SHOULD_MARK_ONLINE)
  .transitionTo(StatusEnumValues.S_ONLINE)
  .withAction(wrapEventAction(onOnline))
  .on(EVENTS.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(wrapEventAction(onError))
  .on(EVENTS.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(wrapEventAction(onKicked))
stateMachine
  .state(StatusEnumValues.S_ONLINE)
  .on(EVENTS.ERROR)
  .transitionTo(StatusEnumValues.S_ERROR)
  .withAction(wrapEventAction(onError))
  .on(EVENTS.KICK)
  .transitionTo(StatusEnumValues.S_KICKED)
  .withAction(wrapEventAction(onKicked))
stateMachine.state(StatusEnumValues.S_KICKED)
stateMachine.state(StatusEnumValues.S_ERROR)
stateMachine.global().onTransition(wrapEventAction(onStateTransition))

const createWorkerState = async (options) => {
  const { phalaApi, txQueue } = options.context
  const { phalaSs58Address } = options.machine
  const WorkerState = getModel('WorkerState')

  const queryAccount = phalaApi.query.system.account(phalaSs58Address)
  const queryStash = phalaApi.query.phala.stashState(phalaSs58Address)

  await queryAccount
  await queryStash
  console.log({
    queryAccount,
    queryStash,
    queryAccountJSON: (await queryAccount).toJSON(),
    queryStashJSON: (await queryStash).toJSON(),
    phalaSs58Address,
  })

  const state = await WorkerState.findOneAndUpdate(
    { workerId: options.machine.id },
    {
      workerId: options.machine.id,
      status: 'S_IDLE',
      balance: { value: queryAccount.data.free.toString() },
      payoutAddress: queryStash.payoutPrefs.target.toString(),
      controller: queryStash.controller.toString(),
    },
    {
      new: true,
      strict: false,
      upsert: true,
    }
  )
  const stateId = state.id

  const innerTxQueue = new PQueue({
    concurrency: 1,
  })

  const stateWriteQueue = new PQueue({
    concurrency: 1,
  })
  const updateState = (opt) =>
    stateWriteQueue.add(() => WorkerState.updateById(stateId, opt))

  const dispatchTx = (...args) =>
    innerTxQueue.add(() => txQueue.dispatch(...args))

  const pruntime = new PRuntime({
    ...options.context,
    machine: options.machine,
    stateId,
    state,
    stateWriteQueue,
    updateState,
    dispatchTx,
  })

  const unsubBalancePromise = phalaApi.query.system.account(
    options.machine.phalaSs58Address,
    ({ data: { free: currentFree } }) =>
      updateState({
        balance: { value: currentFree.toString() },
      }).catch($logger.warn)
  )
  const unsubStashStatePromise = phalaApi.query.phala.stashState(
    options.machine.phalaSs58Address,
    ({ controller, payoutPrefs: { target } }) =>
      updateState({
        controller: controller.toString(),
        payoutAddress: target.toString(),
      }).catch($logger.warn)
  )
  const unsubWorkerStatePromise = phalaApi.query.phala.workerState(
    options.machine.phalaSs58Address,
    ({ state: _workerState }) =>
      updateState({
        workerState: Object.keys(_workerState.toJSON())[0],
      }).catch($logger.warn)
  )
  const unsubs = await Promise.all([
    unsubBalancePromise,
    unsubStashStatePromise,
    unsubWorkerStatePromise,
  ])

  const destroy = () => {
    innerTxQueue.clear()
    return Promise.all(unsubs.map((unsub) => unsub()))
  }

  const sm = stateMachine.start()
  sm.rootStateMachine.workerContext = {
    ...options.context,
    machine: options.machine,
    pruntime,
    stateId,
    state,
    destroy,
    dispatchTx,
    stateWriteQueue,
    updateState,
  }

  sm.handle(EVENTS.SHOULD_START)
  $logger.info(
    { stateId, machineId: options.machine.id },
    'Started monitoring...'
  )

  return sm
}

export { createWorkerState }

import { phalaApi } from '../utils/api'
import _stateMachine, { EVENTS } from './state_machine'
import logger from '../utils/logger'

export const createWorkerContext = async (worker, context) => {
  const snapshot = Object.freeze(Object.assign({}, worker))
  const onChainState = await subscribeOnChainState(snapshot)
  const stateMachine = await _stateMachine.start()

  let errorMessage = ''
  let stateMachineState = 'S_INIT'

  const workerContext = {
    context,
    snapshot,
    worker: snapshot,
    onChainState,
    stateMachine,
    dispatchTx: context.dispatchTx,
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
    get errorMessage() {
      return errorMessage
    },
    set errorMessage(message) {
      errorMessage = message
    },
  }

  stateMachine.rootStateMachine.workerContext = workerContext
  stateMachine.handle(EVENTS.SHOULD_START)

  return workerContext
}

const subscribeOnChainState = async (worker) => {
  const queryAccount = await phalaApi.query.system.account(
    worker.phalaSs58Address
  )
  const queryStash = await phalaApi.query.phala.stashState(
    worker.phalaSs58Address
  )

  let balance = queryAccount.data.free
  let controllerAddress = queryStash.controller.toString()
  let payoutAddress = queryStash.payoutPrefs.target.toString()
  let workerState = 'Empty'

  const unsubBalancePromise = phalaApi.query.system.account(
    worker.phalaSs58Address,
    ({ data: { free: currentFree } }) => {
      balance = currentFree.toString()
    }
  )
  const unsubStashStatePromise = phalaApi.query.phala.stashState(
    worker.phalaSs58Address,
    ({ controller, payoutPrefs: { target } }) => {
      controllerAddress = controller.toString()
      payoutAddress = target.toString()
    }
  )
  const unsubWorkerStatePromise = phalaApi.query.phala.workerState(
    worker.phalaSs58Address,
    ({ state: _workerState }) => {
      workerState = Object.keys(_workerState.toJSON())[0]
    }
  )

  return {
    get balance() {
      return balance
    },
    get controllerAddress() {
      return controllerAddress
    },
    get payoutAddress() {
      return payoutAddress
    },
    get workerState() {
      return workerState
    },
    worker,
    unsubscribe: async () =>
      Promise.all(
        (
          await Promise.all([
            unsubBalancePromise,
            unsubStashStatePromise,
            unsubWorkerStatePromise,
          ])
        ).map((fn) => fn())
      ),
  }
}

export const destroyWorkerContext = async (workerContext) => {
  workerContext.innerTxQueue.clear()
  await workerContext.stateMachine.handle(EVENTS.SHOULD_KICK)
  await workerContext.onChainState.unsubscribe()
}

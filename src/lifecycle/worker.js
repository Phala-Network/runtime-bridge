import { MINIUM_BALANCE } from '../utils/constants'
import { phalaApi } from '../utils/api'
import { protoRoot } from '../message/proto'
import BN from 'bn.js'
import Finity from 'finity'
import logger from '../utils/logger'
import toEnum from '../utils/to_enum'

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

export const createWorkerContext = async (worker, context) => {
  const snapshot = Object.freeze(Object.assign({}, worker))
  const onChainState = await subscribeOnChainState(snapshot)
  logger.info(onChainState)

  let errorMessage = ''

  return {
    context,
    snapshot,
    onChainState,
    get errorMessage() {
      return errorMessage
    },
  }
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
  let workerState = 'S_IDLE'

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

export const destroyWorkerContext = async (workerContext, context) => {
  // get mining state, get intension
}

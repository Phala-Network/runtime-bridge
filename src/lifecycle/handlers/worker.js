import { getModel } from 'ottoman'
import { protoRoot } from '../../message/proto'

const WorkerStatus = protoRoot.lookupEnum('prb.manager.WorkerState.Status')
const EMPTY_OBJECT = Object.freeze({})

export const queryWorkerState = async (message, context) => {
  // todo: return only requested entries
  const Machine = getModel('Machine')
  const WorkerState = getModel('WorkerState')
  const { rows: machines } = await Machine.find({})
  const { rows: states } = await WorkerState.find({})

  const statesMap = {}
  states.forEach((s) => {
    statesMap[s.workerId] = s
  })

  const values = machines.map((m) => {
    const state = statesMap[m.id] || EMPTY_OBJECT

    return {
      status: WorkerStatus.values[state.status] || 0,
      latestSynchedHeaderPhala: state.latestSynchedHeaderPhala,
      latestSynchedBlock: state.latestSynchedBlock,
      initialized: state.initialized,
      payoutAddress: m.payoutAddress,
      indentity: {
        uuid: m.id,
        stashAccountPublic: {
          ss58AddressPhala: m.phalaSs58Address,
        },
        controllerAccountPublic: {
          ss58AddressPhala: m.phalaSs58Address,
        },
      },
    }
  })

  return {
    workerStateUpdate: {
      values,
    },
  }
}
export const requestKickWorker = (message, context) => {}
export const requestCreateWorker = (message, context) => {}
export const requestUpdateWorker = (message, context) => {}
export const requestStartWorkerLifecycle = (message, context) => {}

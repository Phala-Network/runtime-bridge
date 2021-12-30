import { EVENTS } from '../state_machine'
import { NotFoundError } from '../../data_provider/io/updatable'
import { UWorker } from '../../data_provider/io/worker'
import { addWorker, deleteWorker } from '../lifecycle'

const getWorkerStates = (ids, context) =>
  ids.map((id) => {
    const w = context.workerContexts.get(id)
    const { runtimeInfo, info, syncStatus } = w?.runtime || {}
    return {
      status: w?.stateMachineState,
      initialized: info?.initialized,
      parentHeaderSynchedTo: syncStatus?.parentHeaderSynchedTo,
      paraHeaderSynchedTo: syncStatus?.paraHeaderSynchedTo,
      paraBlockDispatchedTo: syncStatus?.paraBlockDispatchedTo,
      worker: w?.snapshotBrief,
      publicKey: runtimeInfo?.publicKey,
      lastMessage: w?.message,
      minerAccountId: w?.onChainState?.accountId?.toString(),
      minerInfoJson: JSON.stringify(
        w?.onChainState?.minerInfo?.humanReadable || {},
        null,
        2
      ),
    }
  })

const getWorker = async (id) => {
  if (id.uuid) {
    return await UWorker.get(id.uuid)
  }
  if (id.name) {
    return await UWorker.getBy('name', id.name)
  }
  throw new NotFoundError(JSON.stringify(id))
}

const queryWorkerState = async (message, context) => {
  const ids = message.content.queryWorkerState.ids.map((i) => i.uuid)
  const results = getWorkerStates(ids, context)
  return {
    workerStateUpdate: {
      workerStates: results,
    },
  }
}
const requestKickWorker = async (message, context) => {
  const workers = await Promise.all(
    message.content.requestKickWorker.requests.map((i) => getWorker(i.id))
  )
  const workerContexts = workers.map((i) => context.workerContexts.get(i.uuid))
  await Promise.all(
    workerContexts.map(async (c) => {
      if (c) {
        await c.stateMachine.handle(EVENTS.SHOULD_KICK)
      }
    })
  )
}
const requestStartWorkerLifecycle = async (message, context) => {
  const workers = await Promise.all(
    message.content.requestStartWorkerLifecycle.requests.map((i) =>
      getWorker(i.id)
    )
  )
  await Promise.all(
    workers.map(async (w) => {
      await deleteWorker(w, context)
      await addWorker(w, context)
    })
  )
}

export default {
  queryHandlers: {
    queryWorkerState,
    requestKickWorker,
    requestStartWorkerLifecycle,
  },
  plainHandlers: {},
}

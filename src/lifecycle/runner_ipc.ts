import { createIpcFork } from '../utils/ipc'
import type { IpcMessageHandler } from '../utils/ipc'
import type { prb } from '@phala/runtime-bridge-walkie'

export type LifecycleHandlerTable = {
  runnerShouldInit?: BatchWorkerActionFn
  runnerShouldRestartWorker?: BatchWorkerActionFn
  runnerShouldKickWorker?: BatchWorkerActionFn
  runnerShouldUpdateWorker?: BatchWorkerActionFn
  managerShouldInitRunner?: IpcMessageHandler<[string]>
  managerShouldUpdateWorkerInfo?: BatchUpdateWorkerStatusFn
}

export type BatchWorkerActionFn = IpcMessageHandler<[string[]]>
export type BatchUpdateWorkerStatusFn = IpcMessageHandler<
  [{ [id: string]: prb.IWorkerState }]
>

export const fork = (
  moduleName: string,
  handlerTable: LifecycleHandlerTable = {},
  env: { [k: string]: string } = {}
) => {
  const { fork } = createIpcFork(handlerTable)
  return fork(moduleName, 'lifecycle/' + moduleName, env)
}

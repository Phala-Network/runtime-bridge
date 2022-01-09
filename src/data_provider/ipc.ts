import { createIpcFork } from '../utils/ipc'
import type { prb } from '@phala/runtime-bridge-walkie'

export type SetNumHandler = (num: number) => void

export type DataProviderHandlerTable = {
  setParentTarget?: SetNumHandler
  setParentFetchedHeight?: SetNumHandler
  setParentProcessedHeight?: SetNumHandler
  setParentCommittedHeight?: SetNumHandler
  setParaTarget?: SetNumHandler
  setParaFetchedHeight?: SetNumHandler
  setParaProcessedHeight?: SetNumHandler
  setParaCommittedHeight?: SetNumHandler
}

const updateNumber = <K extends keyof prb.data_provider.IInfo>(
  key: K,
  info: prb.data_provider.IInfo,
  num: number
) => {
  if ((info[key] as number) < num) {
    info[key] = num
  }
}

export const fork = (
  moduleName: string,
  genesis: prb.db.IGenesis,
  info: prb.data_provider.IInfo,
  env: { [k: string]: string } = {}
) => {
  const handlerTable: DataProviderHandlerTable = {
    setParentTarget: (num) => updateNumber('parentTarget', info, num),
    setParentFetchedHeight: (num) =>
      updateNumber('parentFetchedHeight', info, num),
    setParentProcessedHeight: (num) =>
      updateNumber('parentProcessedHeight', info, num),
    setParentCommittedHeight: (num) =>
      updateNumber('parentCommittedHeight', info, num),
    setParaTarget: (num) => updateNumber('paraTarget', info, num),
    setParaFetchedHeight: (num) => updateNumber('paraFetchedHeight', info, num),
    setParaProcessedHeight: (num) =>
      updateNumber('paraProcessedHeight', info, num),
    setParaCommittedHeight: (num) =>
      updateNumber('paraCommittedHeight', info, num),
  }

  const { fork } = createIpcFork(handlerTable)
  fork(moduleName, 'data_provider/' + moduleName, {
    PHALA_PARA_ID: `${genesis.paraId}`,
    ...env,
  })
}

export const send = createIpcFork({} as DataProviderHandlerTable).send

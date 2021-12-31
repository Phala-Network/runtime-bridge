export type SetNumHandler = (num: number) => void

export type DataProviderHandlerTable = {
  setParentProcessedHeight?: SetNumHandler
  setParentCommittedHeight?: SetNumHandler
  setParaProcessedHeight?: SetNumHandler
  setParaCommittedHeight?: SetNumHandler
}

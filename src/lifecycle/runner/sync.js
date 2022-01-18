import { getHeaderBlob, getParaBlockBlob } from './blob'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

const asyncNoop = (ret) => Promise.resolve(ret)

export const startSync = (runtime) => {
  const {
    workerContext: {
      workerBrief,
      appContext: { fetchStatus, ptpNode },
    },
    info,
    request,
  } = runtime
  let shouldStop = false

  const syncStatus = {
    parentHeaderSynchedTo: -1,
    paraHeaderSynchedTo: -1,
    paraBlockDispatchedTo: -1,
  }
  runtime.syncStatus = syncStatus

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  runtime.stopSync = () => {
    shouldStop = true
    runtime.stopSync = null
    runtime.syncPromise = null
    logger.warn(workerBrief, 'Stopping synching...')
  }

  const doReject = (error) => {
    if (synchedToTargetPromiseFinished) {
      logger.warn('Unexpected rejection.', error)
      return
    }
    runtime.shouldStopUpdateInfo = true
    runtime.stopSync?.()
    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(error)
  }

  let headerSyncNumber = info.headernum
  const doHeaderSync = async () => {
    const blobs = await getHeaderBlob(
      ptpNode,
      headerSyncNumber,
      fetchStatus.parentCommittedHeight
    )
    if (!blobs[0]) {
      await wait(1000)
      return
    }
    const {
      payload: {
        relaychain_synced_to: parentSynchedTo,
        parachain_synced_to: paraSynchedTo,
      },
    } = await request('/bin_api/sync_combined_headers', blobs[0])
    syncStatus.parentHeaderSynchedTo = parentSynchedTo
    if (paraSynchedTo > syncStatus.paraHeaderSynchedTo) {
      syncStatus.paraHeaderSynchedTo = paraSynchedTo
    }
    headerSyncNumber = parentSynchedTo + 1
  }
  async function* headerSyncIterator() {
    while (true) {
      if (shouldStop) {
        return asyncNoop
      }
      if (fetchStatus.parentProcessedHeight < headerSyncNumber) {
        await wait(2000)
        yield asyncNoop
      } else {
        yield doHeaderSync
      }
    }
  }

  let paraBlockSyncNumber = info.blocknum
  const doParaBlockSync = async () => {
    const data = await getParaBlockBlob(
      ptpNode,
      paraBlockSyncNumber,
      syncStatus.paraHeaderSynchedTo,
      fetchStatus.paraCommittedHeight
    )
    if (!data?.length) {
      await wait(2000)
      return
    }
    const {
      payload: { dispatched_to: dispatchedTo },
    } = await request('/bin_api/dispatch_block', data)
    syncStatus.paraBlockDispatchedTo = dispatchedTo
    if (!synchedToTargetPromiseFinished) {
      if (dispatchedTo >= fetchStatus.paraProcessedHeight) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseResolve(dispatchedTo)
      }
    }
    paraBlockSyncNumber = dispatchedTo + 1
  }
  async function* paraBlockSyncIterator() {
    while (true) {
      if (shouldStop) {
        return asyncNoop
      }
      if (fetchStatus.paraHeaderSynchedTo < paraBlockSyncNumber) {
        await wait(2000)
        yield asyncNoop
      } else {
        yield doParaBlockSync
      }
    }
  }

  Promise.all([
    iterate(
      headerSyncIterator,
      async (e, attempt) => {
        logger.warn(
          { attempt, paraBlockSyncNumber, ...workerBrief },
          'Error while synching combined headers:',
          e
        )
        await wait(6000)
        headerSyncNumber = (await runtime.updateInfo()).headernum
      },
      async (e) => {
        logger.warn(
          { headerSyncNumber, ...workerBrief },
          'Final attempt failed while synching combined headers:',
          e
        )
        doReject(e)
        throw e
      }
    ),
    iterate(
      paraBlockSyncIterator,
      async (e, attempt) => {
        logger.warn(
          { attempt, paraBlockSyncNumber, ...workerBrief },
          'Error while dispatching block:',
          e
        )
        await wait(6000)
        paraBlockSyncNumber = (await runtime.updateInfo()).blocknum
      },
      async (e) => {
        logger.warn(
          { paraBlockSyncNumber, ...workerBrief },
          'Final attempt failed while dispatching block:',
          e
        )
        doReject(e)
        throw e
      }
    ),
  ]).catch((e) => {
    logger.error(workerBrief, `Worker stopped due to error:`, e)
  })

  return () => synchedToTargetPromise
}

const iterate = async (iterator, processError, throwFatal) => {
  let attempt = 0
  for await (const fn of iterator()) {
    attempt = 0
    const process = async () => {
      try {
        await fn()
      } catch (e) {
        if (attempt <= 3) {
          try {
            await processError(e, attempt)
          } catch (e) {
            logger.warn(e)
          }
          attempt += 1
          await process()
        } else {
          return await throwFatal(e)
        }
      }
    }
    await process()
  }
}

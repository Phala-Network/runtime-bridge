import { blobRequestTimeout } from '../env'
import { getHeaderBlob, getParaBlockBlob } from './blob'
import { isDev } from '../../utils/env'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

export const asyncNoop = (ret) => Promise.resolve(ret)

const WAIT_ON_ERROR = 18000

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
    try {
      const {
        payload: {
          relaychain_synced_to: parentSynchedTo,
          parachain_synced_to: paraSynchedTo,
        },
      } = await request(
        '/bin_api/sync_combined_headers',
        blobs[0],
        800,
        blobRequestTimeout
      )
      syncStatus.parentHeaderSynchedTo = parentSynchedTo
      // if (paraSynchedTo > syncStatus.paraHeaderSynchedTo) {
      syncStatus.paraHeaderSynchedTo = paraSynchedTo
      // }
      headerSyncNumber = parentSynchedTo + 1
    } catch (e) {
      if (isDev) {
        console.log({
          info,
          syncStatus,
          headerSyncNumber,
          meta: blobs.meta,
        })
      }
      throw e
    }
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
    } = await request('/bin_api/dispatch_block', data, 1000, blobRequestTimeout)
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
      if (syncStatus.paraHeaderSynchedTo < paraBlockSyncNumber) {
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
          { attempt, headerSyncNumber, ...workerBrief },
          'Error while synching combined headers:',
          e
        )
        await wait(WAIT_ON_ERROR)
        const beforeHeaderSyncNumber = headerSyncNumber
        const info = await runtime.updateInfo()
        const _headerSyncNumber = info.headernum
        logger.warn(
          {
            attempt,
            beforeHeaderSyncNumber,
            newHeaderSyncNumber: _headerSyncNumber,
            info,
            ...workerBrief,
          },
          'Got new target from pruntime...'
        )
        headerSyncNumber = _headerSyncNumber
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
        await wait(WAIT_ON_ERROR)
        const beforeParaBlockSyncNumber = paraBlockSyncNumber
        const info = await runtime.updateInfo()
        const _paraBlockSyncNumber = info.blocknum
        logger.warn(
          {
            attempt,
            beforeParaBlockSyncNumber,
            newParaBlockSyncNumber: _paraBlockSyncNumber,
            ...workerBrief,
          },
          'Got new target from pruntime...'
        )
        paraBlockSyncNumber = _paraBlockSyncNumber
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

export const iterate = async (iterator, processError, throwFatal) => {
  let attempt = 0
  let shouldIgnoreError = false
  const setShouldIgnoreError = () => {
    shouldIgnoreError = true
  }
  for await (const fn of iterator()) {
    attempt = 0
    shouldIgnoreError = false
    const process = async () => {
      try {
        await fn()
      } catch (e) {
        if (attempt <= 5) {
          try {
            await processError(e, attempt, setShouldIgnoreError)
            if (shouldIgnoreError) {
              return
            }
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

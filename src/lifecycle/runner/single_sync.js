import { blobRequestTimeout } from '../env'
import { getHeaderBlob, getParaBlockBlob } from './blob'
import { isDev } from '../../utils/env'
import iterate from '../../utils/iterate'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

const asyncNoop = (ret) => Promise.resolve(ret)

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
    parentHeaderSynchedTo: info.headernum,
    paraHeaderSynchedTo: info.paraHeadernum,
    paraBlockDispatchedTo: info.blocknum,
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
  let paraHeaderSyncNumber = info.paraHeadernum
  let paraBlockSyncNumber = info.blocknum

  const doIncrementalHeaderSync = async () => {
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
        1200,
        blobRequestTimeout
      )
      syncStatus.parentHeaderSynchedTo = parentSynchedTo
      syncStatus.paraHeaderSynchedTo = paraSynchedTo
      paraHeaderSyncNumber = paraSynchedTo + 1
      headerSyncNumber = parentSynchedTo + 1
    } catch (e) {
      if (isDev) {
        logger.error({
          info,
          syncStatus,
          headerSyncNumber,
          meta: blobs.meta,
        })
      }
      throw e
    }
  }

  const doBatchHeaderSync = async (count = 0) => {
    if (count >= 5) {
      return
    }
    await doIncrementalHeaderSync()
    return doBatchHeaderSync(count + 1)
  }

  const doParaBlockDifferenceSync = async () => {
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
    } = await request('/bin_api/dispatch_block', data, 800, blobRequestTimeout)
    syncStatus.paraBlockDispatchedTo = dispatchedTo
    if (!synchedToTargetPromiseFinished) {
      if (dispatchedTo >= fetchStatus.paraProcessedHeight) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseResolve(dispatchedTo)
      }
    }
    paraBlockSyncNumber = dispatchedTo + 1

    if (paraBlockSyncNumber < paraHeaderSyncNumber) {
      return doParaBlockDifferenceSync()
    }
  }

  async function* syncIterator() {
    while (true) {
      if (shouldStop) {
        return asyncNoop
      } else if (
        fetchStatus.parentProcessedHeight < headerSyncNumber ||
        fetchStatus.paraFetchedHeight < paraBlockSyncNumber
      ) {
        await wait(2000)
        yield
      } else {
        if (paraBlockSyncNumber < paraHeaderSyncNumber) {
          yield doParaBlockDifferenceSync
        }
        // todo: check if header numbers of relaychain and parachain are mismatched and sync the difference
        // yield doHeaderDifferenceSync
        if (fetchStatus.paraProcessedHeight - paraHeaderSyncNumber > 15000) {
          yield doBatchHeaderSync
        } else {
          yield doIncrementalHeaderSync
        }
        if (paraHeaderSyncNumber > paraBlockSyncNumber) {
          yield doParaBlockDifferenceSync
        }
      }
    }
  }

  iterate(
    syncIterator,
    async (e, attempt) => {
      logger.warn(
        { attempt, headerSyncNumber, paraBlockSyncNumber, ...workerBrief },
        'Error while synching blobs:',
        e
      )
      await wait(WAIT_ON_ERROR)
      const beforeHeaderSyncNumber = headerSyncNumber
      const beforeParaBlockSyncNumber = paraBlockSyncNumber
      const info = await runtime.updateInfo()
      const _headerSyncNumber = info.headernum
      const _paraBlockSyncNumber = info.blocknum
      logger.warn(
        {
          attempt,
          beforeHeaderSyncNumber,
          newHeaderSyncNumber: _headerSyncNumber,
          beforeParaBlockSyncNumber,
          newParaBlockSyncNumber: _paraBlockSyncNumber,
          info,
          ...workerBrief,
        },
        'Got new target from pruntime...'
      )
      headerSyncNumber = _headerSyncNumber
      paraBlockSyncNumber = _paraBlockSyncNumber
    },
    async (e) => {
      logger.warn(
        { headerSyncNumber, paraBlockSyncNumber, ...workerBrief },
        'Final attempt failed while synching blobs:',
        e
      )
      doReject(e)
      throw e
    }
  ).catch((e) => {
    logger.error(workerBrief, `Worker stopped due to error:`, e)
  })

  return () => synchedToTargetPromise
}

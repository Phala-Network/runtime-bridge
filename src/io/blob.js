import { DB_ENCODING_BINARY } from './db_encoding'
import { DB_WINDOW, getDb } from './db'

export const getHeaderBlob = async (blockNumber) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForRange(blockNumber)

  return windowDb.get(
    blockNumber === meta.startBlock
      ? meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey
      : meta.drySyncHeaderReqKey,
    {
      ...DB_ENCODING_BINARY,
    }
  )
}

export const getBlockBlob = async (blockNumber, headerSynchedTo) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForRange(blockNumber)

  return windowDb.get(
    blockNumber === meta.startBlock && headerSynchedTo >= meta.blobStopBlock
      ? meta.blobDispatchBlockReqKey || meta.dryDispatchBlockReqKey
      : meta.dryDispatchBlockReqKey,
    {
      ...DB_ENCODING_BINARY,
    }
  )
}

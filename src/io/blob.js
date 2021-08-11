import { DB_ENCODING_BINARY } from './db_encoding'
import { DB_WINDOW, getDb } from './db'
import { waitForParaBlockRange, waitForRangeByParentNumber } from './window'

export const getHeaderBlob = async (blockNumber) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForRangeByParentNumber(blockNumber)
  const ret = []
  if (blockNumber === meta.parentStartBlock) {
    ret.push(
      await windowDb.get(meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey)
    )
  } else {
    ret.push(await windowDb.get(meta.drySyncHeaderReqKey))
  }
  ret.meta = meta
  return ret
}

export const getParaBlockBlob = async (blockNumber, headerSynchedTo) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForParaBlockRange(blockNumber)
  const dryKey = `dryParaBlock:${blockNumber}`
  const ret = await windowDb.get(
    meta.bufferKey && headerSynchedTo >= meta.lastBlockNumber
      ? meta.bufferKey || dryKey
      : dryKey,
    {
      ...DB_ENCODING_BINARY,
    }
  )
  ret.meta = meta
  return ret
}

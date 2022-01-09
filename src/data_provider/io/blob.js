import { DB_WINDOW, getDb } from './db'
import {
  lruCacheDebugLogInterval,
  lruCacheMaxAge,
  lruCacheSize,
} from '../../utils/env'
import { waitForParaBlockRange, waitForRangeByParentNumber } from './window'
import LRU from 'lru-cache'
import PQueue from 'p-queue'
import logger from '../../utils/logger'

const largeBlobQueue = new PQueue({ concurrency: 3 })

const cache = new LRU({
  max: lruCacheSize,
  maxAge: lruCacheMaxAge,
})

if (lruCacheDebugLogInterval > 0) {
  let prevLength = -1
  setInterval(() => {
    if (prevLength !== cache.length) {
      logger.info(`LRU cache length: ${cache.length}`)
    }
    prevLength = cache.length
  }, lruCacheDebugLogInterval)
}

const getCacheBuffer = async (db, key) => {
  const cached = cache.get(key)

  if (typeof cached !== 'undefined') {
    return cached
  }

  const ret = await largeBlobQueue.add(() => db.getBuffer(key))
  cache.set(key, ret)

  return ret
}

export const getHeaderBlob = async (blockNumber) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForRangeByParentNumber(blockNumber)
  const ret = []
  if (blockNumber === meta.parentStartBlock) {
    ret.push(
      await getCacheBuffer(
        windowDb,
        meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey
      )
    )
  } else {
    ret.push(await getCacheBuffer(windowDb, meta.drySyncHeaderReqKey))
  }
  ret.meta = meta
  return ret
}

export const getParaBlockBlob = async (blockNumber, headerSynchedTo) => {
  const windowDb = await getDb(DB_WINDOW)
  const meta = await waitForParaBlockRange(blockNumber)
  const dryKey = `dryParaBlock:${blockNumber}`
  const retKey =
    meta.bufferKey && headerSynchedTo >= meta.lastBlockNumber
      ? meta.bufferKey || dryKey
      : dryKey

  const ret = await getCacheBuffer(windowDb, retKey)
  ret.meta = meta
  return ret
}

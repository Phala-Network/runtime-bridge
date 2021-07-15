import { DB_WINDOW, NOT_FOUND_ERROR, getDb, getKeyExistance } from './db'
import { getBlock } from './block'
import { pbToObject } from './db_encoding'
import { phalaApi } from '../utils/api'
import { prb } from '../message/proto.generated'
import { range } from '../fetch/compute_window'
import levelErrors from 'level-errors'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

const { Window, RangeMeta } = prb.db

export const getWindow = async (windowId) => {
  const db = await getDb(DB_WINDOW)

  try {
    const buffer = await db.get(`window:${windowId}:pb`)
    const pb = Window.decode(buffer)
    return pbToObject(pb)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

export const createWindow = async (windowId, data) => {
  const db = await getDb(DB_WINDOW)
  const pb = Window.create(data)

  await db.put(`window:${windowId}:pb`, Window.encode(pb).finish())
  return pbToObject(data)
}

export const setEmptyWindow = (windowId, startBlock) => {
  return createWindow(windowId, {
    startBlock,
    stopBlock: -1,
    currentBlock: -1,
    windowId,
    setId: -1,
    isFinished: false,
  })
}
export const updateWindow = async (windowIdOrObject, data) => {
  const db = await getDb(DB_WINDOW)

  const windowId =
    typeof windowIdOrObject === 'number'
      ? windowIdOrObject
      : windowIdOrObject.windowId
  const windowObject =
    typeof windowIdOrObject === 'number'
      ? await getWindow(windowId)
      : windowIdOrObject
  Object.assign(windowObject, data)

  const pb = Window.create(windowObject)
  await db.put(`window:${windowId}:pb`, Window.encode(pb).finish())

  return pbToObject(pb)
}

export const getBlobRange = async (blockNumber) => {
  const db = await getDb(DB_WINDOW)
  try {
    const buffer = await db.get(`rangeByBlock:${blockNumber}:pb`)
    const pb = RangeMeta.decode(buffer).finish()
    return pbToObject(pb)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

const _waitForRange = async (blockNumber) => {
  try {
    const ret = await getBlobRange(blockNumber)
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (error) {
    if (
      error === NOT_FOUND_ERROR ||
      error instanceof levelErrors.NotFoundError
    ) {
      logger.debug({ blockNumber }, 'Waiting for range meta...')
      await wait(2000)
      return _waitForRange(blockNumber)
    }
    throw error
  }
}

export const waitForRange = async (blockNumber) =>
  promiseRetry(
    (retry, number) => {
      return _waitForRange(blockNumber).catch((error) => {
        logger.warn(
          { blockNumber, retryTimes: number },
          'Failed waitForRange, retrying...',
          error
        )
        return retry(error)
      })
    },
    {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 12000,
    }
  )

export const setDryRange = async (
  startBlock,
  stopBlock,
  latestSetId,
  setIdChanged
) => {
  const windowDb = await getDb(DB_WINDOW)
  const currentRange = range(startBlock, stopBlock)

  const rangeWrittenMarkKey = `rangeWritten:${startBlock}:${stopBlock}`
  const drySyncHeaderReqKey = `drySyncHeader:${startBlock}:${stopBlock}`
  const dryDispatchBlockReqKey = `dryDispatchBlock:${startBlock}:${stopBlock}`

  const shouldSkip = await getKeyExistance(windowDb, rangeWrittenMarkKey)

  if (shouldSkip) {
    logger.info({ startBlock, stopBlock }, `Found dryCache, skipping.`)

    return {
      startBlock,
      stopBlock,
      range: currentRange,
      drySyncHeaderReqKey,
      dryDispatchBlockReqKey,
      latestSetId,
    }
  }

  const blockData = {}

  for (const blockNumber of currentRange) {
    blockData[blockNumber] = await getBlock(blockNumber)
  }

  const authoritySetChange = setIdChanged
    ? blockData[stopBlock].authoritySetChange
    : null
  const headers = await Promise.all(
    currentRange.map((b) => blockData[b].syncHeaderData)
  )

  const rawScaleData = [
    phalaApi.createType('SyncHeaderReq', {
      headers,
      authoritySetChange,
    }),
    phalaApi.createType('DispatchBlockReq', {
      blocks: await Promise.all(
        currentRange.map((b) => blockData[b].dispatchBlockData)
      ),
    }),
  ]

  const drySyncHeaderReq = Buffer.from(rawScaleData[0].toU8a())
  const dryDispatchBlockReq = Buffer.from(rawScaleData[1].toU8a())

  const rangeMeta = {
    startBlock,
    stopBlock,
    range: currentRange,
    drySyncHeaderReqKey,
    dryDispatchBlockReqKey,
    latestSetId,
  }

  const rangeMetaPb = RangeMeta.create(rangeMeta)

  const batch = windowDb
    .batch()
    .put(drySyncHeaderReqKey, drySyncHeaderReq)
    .put(dryDispatchBlockReqKey, dryDispatchBlockReq)

  await currentRange
    .reduce(
      (b, blockNumber) =>
        b.put(
          `rangeByBlock:${blockNumber}:pb`,
          RangeMeta.encode(rangeMetaPb).finish()
        ),
      batch
    )
    .write()
  await windowDb.put(rangeWrittenMarkKey, Buffer.from([1]))

  logger.info({ startBlock, stopBlock }, `Saved dryCache.`)

  rangeMeta.rawScaleData = rawScaleData
  return rangeMeta
}

export const commitBlobRange = async (ranges) => {
  const windowDb = await getDb(DB_WINDOW)
  const startBlock = ranges[0].startBlock
  const stopBlock = ranges[ranges.length - 1].stopBlock

  const blobRangeCommitedMarkKey = `blobRangeCommited:${startBlock}:${stopBlock}`
  const blobRangeKey_SyncHeaderReq = `blobRange:${startBlock}:${stopBlock}:SyncHeaderReq`
  const blobRangeKey_DispatchBlockReq = `blobRange:${startBlock}:${stopBlock}:DispatchBlockReq`

  const shouldSkip = await getKeyExistance(windowDb, blobRangeCommitedMarkKey)

  if (shouldSkip) {
    logger.info({ startBlock, stopBlock }, `Found blobRange, skipping.`)
    ranges.length = 0
    return
  }

  const headers = []
  const blocks = []
  let authoritySetChange

  for (const [index, range] of ranges.entries()) {
    if (range.rawScaleData) {
      for (const h of range.rawScaleData[0].headers) {
        headers.push(h)
      }
      for (const b of range.rawScaleData[1].blocks) {
        blocks.push(b)
      }
      if (index === ranges.length - 1) {
        authoritySetChange = range.rawScaleData[0].authoritySetChange
      }
    } else {
      const drySyncHeader = phalaApi.createType(
        'SyncHeaderReq',
        await windowDb.get(
          `drySyncHeader:${range.startBlock}:${range.stopBlock}`
        )
      )
      const dryDispatchBlock = phalaApi.createType(
        'DispatchBlockReq',
        await windowDb.get(
          `dryDispatchBlock:${range.startBlock}:${range.stopBlock}`
        )
      )

      for (const h of drySyncHeader.headers) {
        headers.push(h)
      }
      for (const b of dryDispatchBlock.blocks) {
        blocks.push(b)
      }
      if (index === ranges.length - 1) {
        authoritySetChange = drySyncHeader.authoritySetChange
      }
    }
  }

  const blobSyncHeaderReq = phalaApi.createType('SyncHeaderReq', {
    headers,
    authoritySetChange,
  })
  const blobDispatchBlockReq = phalaApi.createType('DispatchBlockReq', {
    blocks,
  })

  const startBlockRangeMetaKey = `rangeByBlock:${startBlock}:pb`
  const startBlockRangeMetaPb = RangeMeta.decode(
    await windowDb.get(startBlockRangeMetaKey)
  )
  startBlockRangeMetaPb.blobStopBlock = stopBlock
  startBlockRangeMetaPb.blobSyncHeaderReqKey = blobRangeKey_SyncHeaderReq
  startBlockRangeMetaPb.blobDispatchBlockReqKey = blobRangeKey_DispatchBlockReq

  await windowDb
    .batch()
    .put(blobRangeKey_SyncHeaderReq, Buffer.from(blobSyncHeaderReq.toU8a()))
    .put(
      blobRangeKey_DispatchBlockReq,
      Buffer.from(blobDispatchBlockReq.toU8a())
    )
    .put(
      startBlockRangeMetaKey,
      RangeMeta.encode(startBlockRangeMetaPb).finish()
    )
    .write()
  await windowDb.put(startBlockRangeMetaKey, Buffer.from([1]))

  logger.info({ startBlock, stopBlock }, `Commited blobRange.`)

  ranges.length = 0

  return
}

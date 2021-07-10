import {
  DB_BLOCK,
  DB_WINDOW,
  NOT_FOUND_ERROR,
  getDb,
  getKeyExistance,
} from './db'
import { DB_ENCODING_BINARY, DB_ENCODING_DEFAULT } from './db_encoding'
import { phalaApi } from '../utils/api'
import { range } from '../fetch/compute_window'
import levelErrors from 'level-errors'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

export const DB_WINDOW_WINDOW = Object.freeze({
  startBlock: [DB_ENCODING_DEFAULT],
  stopBlock: [DB_ENCODING_DEFAULT],
  currentBlock: [DB_ENCODING_DEFAULT],
  windowId: [DB_ENCODING_DEFAULT],
  setId: [DB_ENCODING_DEFAULT],
  isFinished: [DB_ENCODING_DEFAULT],
})
export const KEYS_DB_WINDOW_WINDOW = Object.freeze(
  Object.keys(DB_WINDOW_WINDOW)
)

export const getWindow = async (windowId) => {
  const db = await getDb(DB_WINDOW)

  try {
    const retArr = await Promise.all(
      KEYS_DB_WINDOW_WINDOW.map((key) =>
        db.get(`window:${windowId}:${key}`, { ...DB_WINDOW_WINDOW[key][0] })
      )
    )
    const ret = {}
    KEYS_DB_WINDOW_WINDOW.forEach((key, index) => {
      ret[key] = retArr[index]
    })
    return ret
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

const setWindowKv = async (windowId, key, value, _db = null) => {
  const db = _db || (await getDb(DB_WINDOW))
  return db.put(`window:${windowId}:${key}`, value, {
    ...DB_WINDOW_WINDOW[key][0],
  })
}

export const createWindow = async (windowId, data) => {
  const db = await getDb(DB_WINDOW)
  await Promise.all(
    KEYS_DB_WINDOW_WINDOW.map((key) =>
      setWindowKv(windowId, key, data[key], db)
    )
  )
  return data
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

  await Promise.all(
    Object.keys(data).map((key) => {
      if (KEYS_DB_WINDOW_WINDOW.indexOf(key) < 0) {
        logger.warn(`Key '${key}' is invalid to window.`)
        return
      }
      return setWindowKv(windowId, key, data[key], db)
    })
  )

  Object.assign(windowObject, data)
  return windowObject
}

export const getBlobRange = async (blockNumber) => {
  const db = await getDb(DB_WINDOW)
  try {
    return db.get(`rangeByBlock:${blockNumber}`, {
      ...DB_ENCODING_DEFAULT,
    })
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
  const blockDb = await getDb(DB_BLOCK)
  const currentRange = range(startBlock, stopBlock)

  const drySyncHeaderReqKey = `drySyncHeader:${startBlock}:${stopBlock}`
  const dryDispatchBlockReqKey = `dryDispatchBlock:${startBlock}:${stopBlock}`

  const shouldSkip = (
    await Promise.all(
      [
        ...currentRange.map((blockNumber) => `rangeByBlock:${blockNumber}`),
        drySyncHeaderReqKey,
        dryDispatchBlockReqKey,
      ].map((k) => getKeyExistance(windowDb, k))
    )
  ).reduce((ret, curr) => ret && curr, true)

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

  const authoritySetChange = setIdChanged
    ? await blockDb.get(`block:${stopBlock}:authoritySetChange`, {
        ...DB_ENCODING_BINARY,
      })
    : null
  const headers = await Promise.all(
    currentRange.map((b) =>
      blockDb.get(`block:${b}:syncHeaderData`, {
        ...DB_ENCODING_BINARY,
      })
    )
  )

  const rawScaleData = [
    phalaApi.createType('SyncHeaderReq', {
      headers,
      authoritySetChange,
    }),
    phalaApi.createType('DispatchBlockReq', {
      blocks: await Promise.all(
        currentRange.map((b) =>
          blockDb.get(`block:${b}:dispatchBlockData`, {
            ...DB_ENCODING_BINARY,
          })
        )
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

  // await Promise.all([
  //   windowDb.put(drySyncHeaderReqKey, drySyncHeaderReq, {
  //     ...DB_ENCODING_BINARY,
  //   }),
  //   windowDb.put(dryDispatchBlockReqKey, dryDispatchBlockReq, {
  //     ...DB_ENCODING_BINARY,
  //   }),
  // ])

  // await Promise.all(
  //   currentRange.map((blockNumber) =>
  //     windowDb.put(`rangeByBlock:${blockNumber}`, rangeMeta)
  //   )
  // )

  // logger.info({ startBlock, stopBlock }, `Saved dryCache.`)
  // await windowDb.put('dry', stopBlock)

  const batch = windowDb
    .batch()
    .put(drySyncHeaderReqKey, drySyncHeaderReq, {
      ...DB_ENCODING_BINARY,
    })
    .put(dryDispatchBlockReqKey, dryDispatchBlockReq, {
      ...DB_ENCODING_BINARY,
    })

  await currentRange
    .reduce(
      (b, blockNumber) => b.put(`rangeByBlock:${blockNumber}`, rangeMeta),
      batch
    )
    .write()

  logger.info({ startBlock, stopBlock }, `Saved dryCache.`)

  rangeMeta.rawScaleData = rawScaleData

  return rangeMeta
}

export const commitBlobRange = async (ranges) => {
  const windowDb = await getDb(DB_WINDOW)
  const startBlock = ranges[0].startBlock
  const stopBlock = ranges[ranges.length - 1].stopBlock
  const blobRangeKey_SyncHeaderReq = `blobRangeKey:${startBlock}:${stopBlock}:SyncHeaderReq`
  const blobRangeKey_DispatchBlockReq = `blobRangeKey:${startBlock}:${stopBlock}:DispatchBlockReq`

  const shouldSkip = (
    await Promise.all(
      [blobRangeKey_SyncHeaderReq, blobRangeKey_DispatchBlockReq].map((k) =>
        getKeyExistance(windowDb, k)
      )
    )
  ).reduce((ret, curr) => ret && curr, true)

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
          `drySyncHeader:${range.startBlock}:${range.stopBlock}`,
          { ...DB_ENCODING_BINARY }
        )
      )
      const dryDispatchBlock = phalaApi.createType(
        'DispatchBlockReq',
        await windowDb.get(
          `dryDispatchBlock:${range.startBlock}:${range.stopBlock}`,
          { ...DB_ENCODING_BINARY }
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
  // await windowDb.put(
  //   blobRangeKey_SyncHeaderReq,
  //   Buffer.from(blobSyncHeaderReq.toU8a()),
  //   { ...DB_ENCODING_BINARY }
  // )
  // await windowDb.put(
  //   blobRangeKey_DispatchBlockReq,
  //   Buffer.from(blobDispatchBlockReq.toU8a()),
  //   { ...DB_ENCODING_BINARY }
  // )

  const startBlockRangeMetaKey = `rangeByBlock:${startBlock}`
  const startBlockRangeMeta = await windowDb.get(startBlockRangeMetaKey)
  startBlockRangeMeta.blobStopBlock = stopBlock
  startBlockRangeMeta.blobSyncHeaderReqKey = blobRangeKey_SyncHeaderReq
  startBlockRangeMeta.blobDispatchBlockReqKey = blobRangeKey_DispatchBlockReq

  await windowDb
    .batch()
    .put(blobRangeKey_SyncHeaderReq, Buffer.from(blobSyncHeaderReq.toU8a()), {
      ...DB_ENCODING_BINARY,
    })
    .put(
      blobRangeKey_DispatchBlockReq,
      Buffer.from(blobDispatchBlockReq.toU8a()),
      { ...DB_ENCODING_BINARY }
    )
    .put(startBlockRangeMetaKey, startBlockRangeMeta)
    .write()
  // await windowDb.put(startBlockRangeMetaKey, startBlockRangeMeta)

  logger.info({ startBlock, stopBlock }, `Commited blobRange.`)

  ranges.length = 0

  return
}

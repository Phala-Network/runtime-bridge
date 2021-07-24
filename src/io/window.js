import { DB_WINDOW, NOT_FOUND_ERROR, getDb, getKeyExistance } from './db'
import { pbToObject } from './db_encoding'
import { phalaApi } from '../utils/api'
import { prb } from '../message/proto.generated'
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
  return pbToObject(pb)
}

export const setEmptyWindow = (windowId, parentStartBlock, paraStartBlock) => {
  return createWindow(windowId, {
    parentStartBlock,
    parentStopBlock: -1,
    paraStartBlock,
    paraStopBlock: -1,
    stopBlock: -1,
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
  parentStartBlock,
  paraStartBlock,
  paraBlocks,
  parentBlocks,
  latestSetId,
  setIdChanged
) => {
  const windowDb = await getDb(DB_WINDOW)

  const _parentStopBlock = parentBlocks[parentBlocks.length - 1]
  const _paraStopBlock = paraBlocks.length
    ? paraBlocks[paraBlocks.length - 1]
    : null
  const parentStopBlock = _parentStopBlock.number
  const paraStopBlock = _paraStopBlock ? _paraStopBlock.number : -1

  const keySuffix = `${parentStartBlock}:${parentStopBlock}:${paraStartBlock}:${paraStopBlock}`
  const rangeWrittenMarkKey = `rangeWritten:${keySuffix}`
  const drySyncHeaderReqKey = `drySyncHeader:${keySuffix}`
  const drySyncParaHeaderReqKey = `drySyncParaHeader:${keySuffix}`
  const dryDispatchBlockReqKey = `dryDispatchBlock:${keySuffix}`
  const shouldSkip = await getKeyExistance(windowDb, rangeWrittenMarkKey)

  const rangeMeta = {
    parentStartBlock,
    parentStopBlock,
    paraStartBlock,
    paraStopBlock,
    parentRange: parentBlocks.map((i) => i.number),
    paraRange: paraBlocks.map((i) => i.number),
    drySyncHeaderReqKey,
    drySyncParaHeaderReqKey,
    dryDispatchBlockReqKey,
    latestSetId,
  }

  if (shouldSkip) {
    logger.info(
      {
        parentStartBlock,
        parentStopBlock,
        paraStartBlock,
        paraStopBlock,
      },
      `Found dryCache, skipping.`
    )

    return rangeMeta
  }

  const rawScaleData = {
    SyncHeaderReq: phalaApi.createType('SyncHeaderReq', {
      headers: parentBlocks.map((b) => b.syncHeaderData),
      authoritySetChange: setIdChanged
        ? _parentStopBlock.authoritySetChange
        : null,
    }),
    SyncParaHeaderReq: _paraStopBlock
      ? phalaApi.createType('SyncParachainHeaderReq', {
          headers: paraBlocks.map((b) => b.header),
          proof: _paraStopBlock.proof,
        })
      : null,
    DispatchBlockReq: _paraStopBlock
      ? phalaApi.createType('DispatchBlockReq', {
          blocks: paraBlocks.map((b) => b.dispatchBlockData),
        })
      : null,
  }

  const drySyncHeaderReq = Buffer.from(rawScaleData.SyncHeaderReq.toU8a())
  const drySyncParaHeaderReq = Buffer.from(
    rawScaleData.SyncParaHeaderReq ? rawScaleData.SyncParaHeaderReq.toU8a() : []
  )
  const dryDispatchBlockReq = Buffer.from(
    rawScaleData.DispatchBlockReq ? rawScaleData.DispatchBlockReq.toU8a() : []
  )

  const rangeMetaPb = RangeMeta.create(rangeMeta)
  const rangeMetaPbBuffer = RangeMeta.encode(rangeMetaPb).finish()

  const batch = windowDb
    .batch()
    .put(drySyncHeaderReqKey, drySyncHeaderReq)
    .put(drySyncParaHeaderReqKey, drySyncParaHeaderReq)
    .put(dryDispatchBlockReqKey, dryDispatchBlockReq)

  parentBlocks.reduce(
    (b, { number }) =>
      b.put(`rangeByParentBlock:${number}:pb`, rangeMetaPbBuffer),
    batch
  )
  paraBlocks.reduce(
    (b, { number }) =>
      b.put(`rangeByParaBlock:${number}:pb`, rangeMetaPbBuffer),
    batch
  )
  batch.put(rangeWrittenMarkKey, Buffer.from([1]))
  await batch.write()

  logger.info(
    { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
    `Saved dryCache.`
  )

  rangeMeta.rawScaleData = rawScaleData
  return rangeMeta
}

export const commitBlobRange = async (ranges, paraRanges) => {
  const windowDb = await getDb(DB_WINDOW)
  const parentStartBlock = ranges[0].parentStartBlock
  const parentStopBlock = ranges[ranges.length - 1].parentStopBlock
  const paraStartBlock = paraRanges.length ? paraRanges[0] : -1
  const paraStopBlock = paraRanges.length
    ? paraRanges[paraRanges.length - 1]
    : -1

  const keySuffix = `${parentStartBlock}:${parentStopBlock}:${paraStartBlock}:${paraStopBlock}`

  const blobRangeCommitedMarkKey = `blobRangeCommited:${keySuffix}`
  const blobRangeKey_SyncHeaderReq = `blobRange:${keySuffix}:SyncHeaderReq`
  const blobRangeKey_SyncParaHeaderReq = `blobRange:${keySuffix}:SyncParaHeaderReq`
  const blobRangeKey_DispatchBlockReq = `blobRange:${keySuffix}:DispatchBlockReq`

  const shouldSkip = await getKeyExistance(windowDb, blobRangeCommitedMarkKey)

  if (shouldSkip) {
    logger.info(
      { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
      `Found blobRange, skipping.`
    )
    ranges.length = 0 // trigger GC
    return
  }

  const parent__headers = []
  let parent__authoritySetChange

  const para__headers = []
  let para__proof

  const blocks = []

  for (const [index, range] of ranges.entries()) {
    if (range.rawScaleData) {
      for (const h of range.rawScaleData.SyncHeaderReq.headers) {
        parent__headers.push(h)
      }
      if (index === ranges.length - 1) {
        parent__authoritySetChange =
          range.rawScaleData.SyncHeaderReq.authoritySetChange
      }

      if (range.paraRange.length) {
        for (const b of range.rawScaleData.SyncParaHeaderReq.headers) {
          para__headers.push(b)
        }
        para__proof = range.rawScaleData.SyncParaHeaderReq.proof

        for (const b of range.rawScaleData.DispatchBlockReq.blocks) {
          blocks.push(b)
        }
      }
    } else {
      const drySyncHeader = phalaApi.createType(
        'SyncHeaderReq',
        await windowDb.get(range.drySyncHeaderReqKey)
      )
      for (const h of drySyncHeader.headers) {
        parent__headers.push(h)
      }
      if (index === ranges.length - 1) {
        parent__authoritySetChange = drySyncHeader.authoritySetChange
      }

      if (range.paraRange.length) {
        const drySyncParaHeader = phalaApi.createType(
          'SyncParachainHeaderReq',
          await windowDb.get(range.drySyncParaHeaderReqKey)
        )
        const dryDispatchBlock = phalaApi.createType(
          'DispatchBlockReq',
          await windowDb.get(range.dryDispatchBlockReqKey)
        )
        for (const b of drySyncParaHeader.headers) {
          para__headers.push(b)
        }
        para__proof = drySyncParaHeader.proof

        for (const b of dryDispatchBlock.blocks) {
          blocks.push(b)
        }
      }
    }
  }

  const blobSyncHeaderReq = phalaApi.createType('SyncHeaderReq', {
    headers: parent__headers,
    authoritySetChange: parent__authoritySetChange,
  })
  const blobSyncParaHeaderReq = para__headers
    ? phalaApi.createType('SyncParachainHeaderReq', {
        headers: para__headers,
        proof: para__proof,
      })
    : null
  const blobDispatchBlockReq = blocks.length
    ? phalaApi.createType('DispatchBlockReq', {
        blocks,
      })
    : null

  const startBlockRangeMetaKey = `rangeByParentBlock:${parentStartBlock}:pb`
  const startBlockRangeMetaPb = RangeMeta.decode(
    await windowDb.get(startBlockRangeMetaKey)
  )
  startBlockRangeMetaPb.blobParentStopBlock = parentStopBlock
  startBlockRangeMetaPb.blobSyncHeaderReqKey = blobRangeKey_SyncHeaderReq
  startBlockRangeMetaPb.blobSyncParaHeaderReqKey = blobRangeKey_SyncParaHeaderReq
  startBlockRangeMetaPb.blobDispatchBlockReqKey = blobRangeKey_DispatchBlockReq

  const batch = await windowDb.batch()

  batch
    .put(blobRangeKey_SyncHeaderReq, Buffer.from(blobSyncHeaderReq.toU8a()))
    .put(
      blobRangeKey_SyncParaHeaderReq,
      Buffer.from(blobSyncParaHeaderReq ? blobSyncParaHeaderReq.toU8a() : [])
    )
    .put(
      blobRangeKey_DispatchBlockReq,
      Buffer.from(blobDispatchBlockReq ? blobDispatchBlockReq.toU8a() : [])
    )
    .put(
      startBlockRangeMetaKey,
      RangeMeta.encode(startBlockRangeMetaPb).finish()
    )
  await batch.write()
  await windowDb.put(blobRangeCommitedMarkKey, Buffer.from([1]))

  logger.info(
    { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
    `Commited blobRange.`
  )

  ranges.length = 0

  return
}

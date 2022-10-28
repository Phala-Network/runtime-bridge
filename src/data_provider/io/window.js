import {
  LAST_COMMITTED_PARA_BLOCK,
  LAST_COMMITTED_PARA_BLOCK_BATCH,
  LAST_COMMITTED_PARENT_BLOCK,
} from '../../utils/constants'
import { getDb, getKeyExistence, waitFor } from './db'
import { getParentBlock } from './block'
import { pbToObject } from './db_encoding'
import { phalaApi } from '../../utils/api'
import { prb } from '@phala/runtime-bridge-walkie'
import { throttle } from 'lodash/function'
import logger from '../../utils/logger'

const { Window, RangeMeta } = prb.db

export const getWindow = async (windowId) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`window:${windowId}:pb`)
  if (!buffer) {
    return buffer
  }
  const pb = Window.decode(buffer)
  return pbToObject(pb)
}

export const createWindow = async (windowId, data) => {
  const db = await getDb()
  const pb = Window.create(data)

  await db.setBuffer(`window:${windowId}:pb`, Window.encode(pb).finish())
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
  const db = await getDb()

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
  await db.setBuffer(`window:${windowId}:pb`, Window.encode(pb).finish())

  return pbToObject(pb)
}

export const getRangeByParentNumber = async (number) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`rangeByParentBlock:${number}:pb`)
  if (!buffer) {
    return buffer
  }
  const pb = RangeMeta.decode(buffer)
  return pbToObject(pb)
}
export const waitForRangeByParentNumber = (number) =>
  waitFor(() => getRangeByParentNumber(number))

export const getRangeByParaNumber = async (number) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`rangeByParaBlock:${number}:pb`)
  if (!buffer) {
    return buffer
  }
  const pb = RangeMeta.decode(buffer)
  return pbToObject(pb)
}
export const waitForRangeByParaNumber = (number) =>
  waitFor(() => getRangeByParaNumber(number))

export const setDryRange = async (
  parentStartBlock,
  paraStartBlock,
  paraBlocks,
  parentBlocks,
  latestSetId,
  setIdChanged
) => {
  const windowDb = await getDb()

  const _parentStopBlock = parentBlocks[parentBlocks.length - 1]
  const _paraStopBlock = paraBlocks.length
    ? paraBlocks[paraBlocks.length - 1]
    : null
  const parentStopBlock = _parentStopBlock.number
  const paraStopBlock = _paraStopBlock ? _paraStopBlock.number : -1

  logger.info(
    {
      parentStartBlock,
      parentStopBlock,
      paraStartBlock,
      paraStopBlock,
    },
    'Start setDryRange'
  )

  const keySuffix = `${parentStartBlock}:${parentStopBlock}:${paraStartBlock}:${paraStopBlock}`
  const rangeWrittenMarkKey = `rangeWritten:${keySuffix}`
  const drySyncHeaderReqKey = `drySyncHeader:${keySuffix}`
  const shouldSkip = await getKeyExistence(windowDb, rangeWrittenMarkKey)

  const rangeMeta = {
    parentStartBlock,
    parentStopBlock,
    paraStartBlock,
    paraStopBlock,
    parentRange: parentBlocks.map((i) => i.number),
    paraRange: paraBlocks.map((i) => i.number),
    drySyncHeaderReqKey,
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
    SyncHeaderReq: phalaApi.createType('SyncCombinedHeadersReq', {
      relaychainHeaders: parentBlocks.map((b) => b.syncHeaderData),
      authoritySetChange: setIdChanged
        ? _parentStopBlock.authoritySetChange
        : null,
      ...(_paraStopBlock
        ? {
            parachainHeaders: paraBlocks.map((b) => b.header),
            proof: _parentStopBlock.paraProof,
          }
        : {
            parachainHeaders: [],
            proof: [],
          }),
    }),
  }

  const drySyncHeaderReq = Buffer.from(rawScaleData.SyncHeaderReq.toU8a())

  const rangeMetaPb = RangeMeta.create(rangeMeta)
  const rangeMetaPbBuffer = RangeMeta.encode(rangeMetaPb).finish()

  const batch = windowDb.batch()
  batch.put(drySyncHeaderReqKey, drySyncHeaderReq)
  batch.put(`rangeByParentBlock:${parentStartBlock}:pb`, rangeMetaPbBuffer)
  batch.put(`rangeByParaBlock:${parentStartBlock}:pb`, rangeMetaPbBuffer)
  batch.put(rangeWrittenMarkKey, Buffer.from([1]))
  await batch.write()

  logger.info(
    { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
    `Saved dryCache.`
  )

  rangeMeta.rawScaleData = rawScaleData
  return rangeMeta
}

export const commitBlobRange = async (context) => {
  const windowDb = await getDb()
  const {
    parentStartBlock,
    parentStopBlock,
    accParentBlocks: parentBlocks,
    accParaBlocks: paraBlocks,
  } = context
  const paraStartBlock = paraBlocks.length ? context.paraStartBlock : -1
  const paraStopBlock = paraBlocks.length ? context.paraStopBlock : -1

  const keySuffix = `${parentStartBlock}:${parentStopBlock}:${paraStartBlock}:${paraStopBlock}`

  const blobRangeCommittedMarkKey = `blobRangeCommitted:${keySuffix}`
  const blobRangeKey_SyncHeaderReq = `blobRange:${keySuffix}:SyncHeaderReq`
  const shouldSkip = await getKeyExistence(windowDb, blobRangeCommittedMarkKey)

  if (shouldSkip) {
    logger.info(
      { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
      `Found blobRange, skipping.`
    )

    // trigger GC
    parentBlocks.length = 0
    paraBlocks.length = 0

    return
  }

  const parent__headers = phalaApi.createType(
    'Vec<HeaderToSync>',
    parentBlocks.map((b, id) =>
      id === parentBlocks.length - 1
        ? b.syncHeaderData
        : {
            header: b.header,
            justification: null,
          }
    )
  )
  const parent__authoritySetChange =
    parentBlocks[parentBlocks.length - 1].authoritySetChange

  const para__headers = phalaApi.createType(
    'Vec<Header>',
    paraBlocks.map((b) => b.header)
  )
  const para__proof = parentBlocks[parentBlocks.length - 1].paraProof

  const blobSyncHeaderReq = phalaApi.createType('SyncCombinedHeadersReq', {
    relaychainHeaders: parent__headers,
    authoritySetChange: parent__authoritySetChange,
    parachainHeaders: para__headers,
    proof: para__proof,
  })

  const batch = windowDb.batch()

  for (const b of parentBlocks) {
    const startBlockRangeMetaKey = `rangeByParentBlock:${b.number}:pb`
    const buffer = await windowDb.getBuffer(startBlockRangeMetaKey)

    if (buffer) {
      const startBlockRangeMetaPb = RangeMeta.decode(
        await windowDb.getBuffer(startBlockRangeMetaKey)
      )
      startBlockRangeMetaPb.blobParentStopBlock = parentStopBlock
      startBlockRangeMetaPb.blobParaStopBlock = paraStopBlock
      startBlockRangeMetaPb.blobSyncHeaderReqKey = blobRangeKey_SyncHeaderReq
      const startBlockRangeMetaPbBuffer = RangeMeta.encode(
        startBlockRangeMetaPb
      ).finish()

      batch.put(startBlockRangeMetaKey, startBlockRangeMetaPbBuffer)
    }
  }

  batch.put(blobRangeKey_SyncHeaderReq, Buffer.from(blobSyncHeaderReq.toU8a()))

  await batch.write()
  await windowDb.setBuffer(blobRangeCommittedMarkKey, Buffer.from([1]))

  logger.info(
    { parentStartBlock, parentStopBlock, paraStartBlock, paraStopBlock },
    `Committed blobRange.`
  )

  // trigger GC
  parentBlocks.length = 0
  paraBlocks.length = 0
}

export const getLastCommittedParaBlock = async () => {
  const db = await getDb()
  return parseInt(await db.getJson(LAST_COMMITTED_PARA_BLOCK)) || 0
}

export const setLastCommittedParaBlock = async (number) => {
  const db = await getDb()
  return db.setJson(LAST_COMMITTED_PARA_BLOCK, number)
}

export const getLastCommittedParaBlockBatch = async () => {
  const db = await getDb()
  return parseInt(await db.getJson(LAST_COMMITTED_PARA_BLOCK_BATCH)) || 0
}

export const setLastCommittedParaBlockBatch = async (number) => {
  const db = await getDb()
  return db.setJson(LAST_COMMITTED_PARA_BLOCK_BATCH, number)
}

export const getLastCommittedParentBlock = async () => {
  const db = await getDb()
  return parseInt(await db.getJson(LAST_COMMITTED_PARENT_BLOCK)) || 0
}

export const setLastCommittedParentBlock = async (number) => {
  const db = await getDb()
  return db.setJson(LAST_COMMITTED_PARENT_BLOCK, number)
}

export const t_setLastCommittedParentBlock = throttle(
  setLastCommittedParentBlock,
  10000
)

export const setDryParaBlockRange = async (block) => {
  const db = await getDb()
  const indexKey = `rangeParaBlock:key:${block.number}`
  const key = `dryParaBlock:${block.number}`
  if (await getKeyExistence(db, key)) {
    logger.info(`Found dry cache for para block #${block.number}.`)
    return
  }
  const batch = db.batch()
  batch.put(
    key,
    Buffer.from(
      phalaApi
        .createType('Vec<BlockHeaderWithChanges>', [block.dispatchBlockData])
        .toU8a()
    )
  )
  batch.put(
    indexKey,
    JSON.stringify({
      firstBlockNumber: block.number,
      lastBlockNumber: block.number,
    })
  )
  await batch.write()
  logger.info(`Saved dry cache for para block #${block.number}.`)
}

export const setRangeParaBlockBuffer = async (blocks) => {
  const db = await getDb()
  const firstBlockNumber = blocks[0].number
  const lastBlockNumber = blocks[blocks.length - 1].number
  const indexKey = `rangeParaBlock:key:${firstBlockNumber}`
  const bufferKey = `rangeParaBlock:buffer:${firstBlockNumber}`
  if (await getKeyExistence(db, bufferKey)) {
    logger.info(
      `Found range cache for para block #${firstBlockNumber} to #${lastBlockNumber}, will override.`
    )
  }
  const batch = db.batch()
  batch.put(
    bufferKey,
    Buffer.from(
      phalaApi
        .createType(
          'Vec<BlockHeaderWithChanges>',
          blocks.map((b) => b.dispatchBlockData)
        )
        .toU8a()
    )
  )
  batch.put(
    indexKey,
    JSON.stringify({ bufferKey, firstBlockNumber, lastBlockNumber })
  )
  await batch.write()
  logger.info(
    `Saved range cache for para block #${firstBlockNumber} to #${lastBlockNumber}.`
  )
}

export const getParaBlockRange = async (number) => {
  const db = await getDb()
  const indexKey = `rangeParaBlock:key:${number}`
  return JSON.parse(await db.get(indexKey))
}

export const waitForParaBlockRange = (number) =>
  waitFor(() => getParaBlockRange(number))

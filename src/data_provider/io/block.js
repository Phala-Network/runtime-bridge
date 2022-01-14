import { DB_PB_TO_OBJECT_OPTIONS, pbToObject } from './db_encoding'
import { NOT_FOUND_ERROR, getDb, getKeyExistence } from './db'
import { prb } from '@phala/runtime-bridge-walkie'
import logger from '../../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'

const { ParaBlock, ParentBlock, Genesis } = prb.db

export const SCALE_TYPES__BLOCK = Object.freeze({
  hash: 'ParaBlockHash',
  header: 'Header',
  syncHeaderData: 'HeaderToSync',
  dispatchBlockData: 'BlockHeaderWithChanges',
  authoritySetChange: 'Option<AuthoritySetChange>',
  paraProof: 'StorageProof',
})

export const keys__SCALE_TYPES__BLOCK = Object.freeze(
  Object.keys(SCALE_TYPES__BLOCK)
)

export const encodeBlockScale = (block, shouldCopy = false) => {
  const ret = shouldCopy ? { ...block } : block
  for (const key of keys__SCALE_TYPES__BLOCK) {
    if (ret[key]) {
      ret[key] = ret[key].toU8a()
    }
  }
  return ret
}

export const getParaBlockExistence = async (number) => {
  const db = await getDb()
  return getKeyExistence(db, `para:${number}:written`)
}

export const setParaBlock = async (number, block) => {
  const db = await getDb()
  const blockPb = ParaBlock.create(block)
  await db.setBuffer(`para:${number}:pb`, ParaBlock.encode(blockPb).finish())
  await db.setBuffer(`para:${number}:written`, Buffer.from([1]))
  return pbToObject(blockPb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getParaBlock = async (number) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`para:${number}:pb`)
  if (!buffer) {
    return buffer
  }
  return pbToObject(ParaBlock.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
}

const _waitForParaBlock = async (blockNumber) => {
  try {
    const ret = await getParaBlock(blockNumber)
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (error) {
    if (error === NOT_FOUND_ERROR) {
      await wait(50)
      return _waitForParaBlock(blockNumber)
    }
    throw error
  }
}

export const waitForParaBlock = (blockNumber) =>
  promiseRetry(
    (retry, number) => {
      return _waitForParaBlock(blockNumber).catch((error) => {
        logger.warn(
          { blockNumber, retryTimes: number },
          'Failed getting parachain block, retrying...',
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

export const getParentBlockExistance = async (number) => {
  const db = await getDb()
  return getKeyExistence(db, `parent:${number}:written`)
}

export const setParentBlock = async (number, block) => {
  const db = await getDb()
  const blockPb = ParentBlock.create(block)
  await db.setBuffer(
    `parent:${number}:pb`,
    ParentBlock.encode(blockPb).finish()
  )
  await db.setBuffer(`parent:${number}:written`, Buffer.from([1]))
  return pbToObject(blockPb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getParentBlock = async (number) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`parent:${number}:pb`)
  if (!buffer) {
    return buffer
  }
  return pbToObject(ParentBlock.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
}

const _waitForParentBlock = async (blockNumber) => {
  try {
    const ret = await getParentBlock(blockNumber)
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (error) {
    if (error === NOT_FOUND_ERROR) {
      await wait(50)
      return _waitForParentBlock(blockNumber)
    }
    throw error
  }
}

export const waitForParentBlock = (blockNumber) =>
  promiseRetry(
    (retry, number) => {
      return _waitForParentBlock(blockNumber).catch((error) => {
        logger.warn(
          { blockNumber, retryTimes: number },
          'Failed getting parent block, retrying...',
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

export const setGenesis = async (genesis) => {
  const db = await getDb()
  const pb = Genesis.create(genesis)
  await db.setBuffer(
    `genesis:${genesis.paraId}:pb`,
    Genesis.encode(pb).finish()
  )
  await db.setBuffer(`genesis:${genesis.paraId}:written`, Buffer.from([1]))
  return pbToObject(pb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getGenesis = async (paraId) => {
  const db = await getDb()
  const buffer = await db.getBuffer(`genesis:${paraId}:pb`)
  if (!buffer) {
    return null
  }
  return pbToObject(Genesis.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
}

import { DB_BLOCK, NOT_FOUND_ERROR, getDb, getKeyExistance } from './db'
import {
  DB_ENCODING_JSON,
  DB_PB_TO_OBJECT_OPTIONS,
  pbToObject,
} from './db_encoding'
import { phalaApi } from '../utils/api'
import { prb } from '../message/proto.generated'
import levelErrors from 'level-errors'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

const { ParaBlock, ParentBlock, Genesis } = prb.db

export const SCALE_TYPES__BLOCK = Object.freeze({
  hash: 'ParaBlockHash',
  header: 'Header',
  syncHeaderData: 'HeaderToSync',
  dispatchBlockData: 'BlockHeaderWithChanges',
  authoritySetChange: 'Option<AuthoritySetChange>',
  proof: 'StorageProof',
})

export const keys__SCALE_TYPES__BLOCK = Object.freeze(
  Object.keys(SCALE_TYPES__BLOCK)
)

export const decodeBlockScale = (block, shouldCopy = false) => {
  const ret = shouldCopy ? { ...block } : block
  for (const key of keys__SCALE_TYPES__BLOCK) {
    if (Buffer.isBuffer(ret[key])) {
      ret[key] = phalaApi.createType(SCALE_TYPES__BLOCK[key], ret[key])
    }
  }
  return ret
}
export const encodeBlockScale = (block, shouldCopy = false) => {
  const ret = shouldCopy ? { ...block } : block
  for (const key of keys__SCALE_TYPES__BLOCK) {
    if (ret[key]) {
      ret[key] = ret[key].toU8a()
    }
  }
  return ret
}

export const getParaBlockExistance = async (number) => {
  const db = await getDb(DB_BLOCK)
  return getKeyExistance(db, `para:${number}:written`)
}

export const setParaBlock = async (number, block) => {
  const db = await getDb(DB_BLOCK)
  const blockPb = ParaBlock.create(block)
  await db.put(`para:${number}:pb`, ParaBlock.encode(blockPb).finish())
  await db.put(`para:${number}:written`, Buffer.from([1]))
  return pbToObject(blockPb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getParaBlock = async (number) => {
  const db = await getDb(DB_BLOCK)
  try {
    const buffer = await db.get(`para:${number}:pb`)
    return pbToObject(ParaBlock.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
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
      logger.debug({ blockNumber }, 'Waiting for parachain block...')
      await wait(2000)
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
  const db = await getDb(DB_BLOCK)
  return getKeyExistance(db, `parent:${number}:written`)
}

export const setParentBlock = async (number, block) => {
  const db = await getDb(DB_BLOCK)
  const blockPb = ParentBlock.create(block)
  await db.put(`parent:${number}:pb`, ParentBlock.encode(blockPb).finish())
  await db.put(`parent:${number}:written`, Buffer.from([1]))
  return pbToObject(blockPb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getParentBlock = async (number) => {
  const db = await getDb(DB_BLOCK)
  try {
    const buffer = await db.get(`parent:${number}:pb`)
    return pbToObject(ParentBlock.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
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
      logger.debug({ blockNumber }, 'Waiting for parent block...')
      await wait(2000)
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

export const bindBlock = async (paraNumber, parentNumber) => {
  const db = await getDb(DB_BLOCK)
  await db.put(`paraToParent:${paraNumber}`, parentNumber, {
    ...DB_ENCODING_JSON,
  })
  await db.put(`parentToPara:${parentNumber}`, paraNumber, {
    ...DB_ENCODING_JSON,
  })
  return
}

export const getParaNumber = async (parentNumber) => {
  const db = await getDb(DB_BLOCK)
  try {
    await db.get(`parentToPara:${parentNumber}`, {
      ...DB_ENCODING_JSON,
    })
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

export const getParentNumber = async (paraNumber) => {
  const db = await getDb(DB_BLOCK)
  try {
    await db.get(`paraToParent:${paraNumber}`, {
      ...DB_ENCODING_JSON,
    })
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

export const setGenesis = async (genesis) => {
  const db = await getDb(DB_BLOCK)
  const pb = Genesis.create(genesis)
  await db.put(`genesis:${genesis.paraId}:pb`, Genesis.encode(pb).finish())
  await db.put(`genesis:${genesis.paraId}:written`, Buffer.from([1]))
  return pbToObject(pb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getGenesis = async (paraId) => {
  const db = await getDb(DB_BLOCK)
  try {
    const buffer = await db.get(`genesis:${paraId}:pb`)
    return pbToObject(Genesis.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

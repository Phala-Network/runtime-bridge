import { DB_BLOCK, NOT_FOUND_ERROR, getDb, getKeyExistance } from './db'
import { DB_PB_TO_OBJECT_OPTIONS, pbToObject } from './db_encoding'
import { phalaApi } from '../utils/api'
import { prb } from '../message/proto.generated'
import levelErrors from 'level-errors'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

const { Block } = prb.db

export const SCALE_TYPES__BLOCK = Object.freeze({
  hash: 'BlockHash',
  header: 'Header',
  syncHeaderData: 'HeaderToSync',
  dispatchBlockData: 'BlockHeaderWithEvents',
  authoritySetChange: 'Option<AuthoritySetChange>',
  genesisState: 'Vec<KeyValue>',
  bridgeGenesisInfo: 'GenesisInfo',
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

export const getBlockExistance = async (number) => {
  const db = await getDb(DB_BLOCK)
  return getKeyExistance(db, `block:${number}:written`)
}

export const setBlock = async (number, block) => {
  const db = await getDb(DB_BLOCK)
  const blockPb = Block.create(block)
  await db.put(`block:${number}:pb`, Block.encode(blockPb).finish())
  await db.put(`block:${number}:written`, Buffer.from([1]))
  return pbToObject(blockPb, DB_PB_TO_OBJECT_OPTIONS)
}

export const getBlock = async (number) => {
  const db = await getDb(DB_BLOCK)
  try {
    const buffer = await db.get(`block:${number}:pb`)
    return pbToObject(Block.decode(buffer), DB_PB_TO_OBJECT_OPTIONS)
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

export const getGenesisBlock = () => getBlock(0)
export const setGenesisBlock = (block) => setBlock(0, block)

const _waitForBlock = async (blockNumber) => {
  try {
    const ret =
      blockNumber > 0 ? await getBlock(blockNumber) : await getGenesisBlock()
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (error) {
    if (error === NOT_FOUND_ERROR) {
      logger.debug({ blockNumber }, 'Waiting for block...')
      await wait(2000)
      return _waitForBlock(blockNumber)
    }
    throw error
  }
}

export const waitForBlock = (blockNumber) =>
  promiseRetry(
    (retry, number) => {
      return _waitForBlock(blockNumber).catch((error) => {
        logger.warn(
          { blockNumber, retryTimes: number },
          'Failed getting block, retrying...',
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

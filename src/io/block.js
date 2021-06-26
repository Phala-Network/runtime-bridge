import {
  DB_BLOCK,
  DB_WINDOW,
  NOT_FOUND_ERROR,
  getDb,
  readonlyGet,
  setupDb,
} from './db'
import { DB_ENCODING_BINARY, DB_ENCODING_DEFAULT } from './db_encoding'
import { phalaApi } from '../utils/api'
import { range } from '../fetch/compute_window'
import { waitForBlobRangeEnd } from './window'
import levelErrors from 'level-errors'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../utils/wait'

export const DB_BLOCK_BLOCK = Object.freeze({
  blockNumber: [DB_ENCODING_DEFAULT],
  hash: [DB_ENCODING_BINARY, 'BlockHash'],
  header: [DB_ENCODING_BINARY, 'Header'],
  setId: [DB_ENCODING_DEFAULT],
  isNewRound: [DB_ENCODING_DEFAULT],
  hasJustification: [DB_ENCODING_DEFAULT],
  syncHeaderData: [DB_ENCODING_BINARY, 'HeaderToSync'],
  dispatchBlockData: [DB_ENCODING_BINARY, 'BlockHeaderWithEvents'],
  authoritySetChange: [DB_ENCODING_BINARY, 'Option<AuthoritySetChange>'],
})
export const DB_BLOCK_GENESIS_BLOCK = Object.freeze({
  ...DB_BLOCK_BLOCK,
  genesisState: [DB_ENCODING_BINARY, 'Vec<KeyValue>'],
  bridgeGenesisInfo: [DB_ENCODING_BINARY, 'GenesisInfo'],
})
export const KEYS_DB_BLOCK_BLOCK = Object.freeze(Object.keys(DB_BLOCK_BLOCK))
export const KEYS_DB_BLOCK_GENESIS_BLOCK = Object.freeze(
  Object.keys(DB_BLOCK_GENESIS_BLOCK)
)

export const decodeBlock = (block) => {
  const ret = {}
  Object.keys(block).forEach((key) => {
    if (!DB_BLOCK_GENESIS_BLOCK[key]) {
      return
    }
    const [encoding, scaleTypeName] = DB_BLOCK_GENESIS_BLOCK[key]
    if (encoding === DB_ENCODING_DEFAULT) {
      ret[key] = block[key]
      return
    }
    ret[key] = phalaApi.createType(scaleTypeName, block[key])
  })
  return ret
}
export const encodeBlock = (block) => {
  const ret = {}
  Object.keys(block).forEach((key) => {
    if (!DB_BLOCK_GENESIS_BLOCK[key]) {
      return
    }
    const [encoding] = DB_BLOCK_GENESIS_BLOCK[key]
    if (encoding === DB_ENCODING_DEFAULT) {
      ret[key] = block[key]
      return
    }
    if (!block[key]?.toU8a) {
      return
    }
    ret[key] = block[key].toU8a()
  })
  return ret
}

export const setGenesisBlock = async (block) => {
  const db = getDb(DB_BLOCK)
  await Promise.all(
    KEYS_DB_BLOCK_GENESIS_BLOCK.map((key) =>
      db.put(`block:0:${key}`, block[key], {
        ...DB_BLOCK_GENESIS_BLOCK[key][0],
      })
    )
  )
  return block
}

export const getGenesisBlock = async () => {
  const db = getDb(DB_BLOCK)

  try {
    const retArr = await Promise.all(
      KEYS_DB_BLOCK_GENESIS_BLOCK.map((key) =>
        db.get(`block:0:${key}`, { ...DB_BLOCK_GENESIS_BLOCK[key][0] })
      )
    )
    const ret = {}
    KEYS_DB_BLOCK_GENESIS_BLOCK.forEach((key, index) => {
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

export const setBlock = async (number, block) => {
  const db = getDb(DB_BLOCK)
  await Promise.all(
    KEYS_DB_BLOCK_BLOCK.map((key) =>
      db.put(`block:${number}:${key}`, block[key], {
        ...DB_BLOCK_BLOCK[key][0],
      })
    )
  )
  return block
}

export const getBlock = async (number) => {
  const db = getDb(DB_BLOCK)

  try {
    const retArr = await Promise.all(
      KEYS_DB_BLOCK_BLOCK.map((key) =>
        db.get(`block:${number}:${key}`, { ...DB_BLOCK_BLOCK[key][0] })
      )
    )
    const ret = {}
    KEYS_DB_BLOCK_BLOCK.forEach((key, index) => {
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
      await setupDb([], [DB_BLOCK])
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

export const getHeaderBlobs = async (blockNumber) => {
  const blockRange = range(blockNumber, await waitForBlobRangeEnd(blockNumber))
  const headerBlobs = await Promise.all(
    blockRange.map((b) =>
      readonlyGet(DB_BLOCK, `block:${b}:syncHeaderData`, {
        ...DB_ENCODING_BINARY,
      }).then((buf) => buf.toString('base64'))
    )
  )

  const lastBlockInRange = blockRange[blockRange.length - 1]
  const hasAuthoritySetChange = await readonlyGet(
    DB_WINDOW,
    `setIdChanged:${lastBlockInRange}`
  )
  const authoritySetChange = hasAuthoritySetChange
    ? Buffer.from(
        phalaApi
          .createType(
            'Option<AuthoritySetChange>',
            await readonlyGet(
              DB_BLOCK,
              `block:${lastBlockInRange}:authoritySetChange`,
              {
                ...DB_ENCODING_BINARY,
              }
            )
          )
          .unwrapOrDefault()
          .toU8a()
      ).toString('base64')
    : undefined

  return {
    headers_b64: headerBlobs,
    authority_set_change_b64: authoritySetChange,
  }
}

export const getBlockBlobs = async (blockNumber) => {
  const blockRange = range(blockNumber, await waitForBlobRangeEnd(blockNumber))

  return {
    blocks_b64: await Promise.all(
      blockRange.map((b) =>
        readonlyGet(DB_BLOCK, `block:${b}:dispatchBlockData`, {
          ...DB_ENCODING_BINARY,
        }).then((i) => i.toString('base64'))
      )
    ),
  }
}

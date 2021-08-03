import { DB_BLOCK, setupDb } from '../io/db'
import { FRNK, GRANDPA_AUTHORITIES_KEY } from '../utils/constants'
import { SET_GENESIS, SET_PARA_KNOWN_HEIGHT, SET_PARENT_KNOWN_HEIGHT } from '.'
import {
  bindBlock,
  encodeBlockScale,
  getGenesis,
  getParaBlock,
  getParentBlockExistance,
  setGenesis,
  setParaBlock,
  setParentBlock,
} from '../io/block'
import {
  parentApi,
  phalaApi,
  setupParentApi,
  setupPhalaApi,
} from '../utils/api'
import Queue from 'promise-queue'
import env from '../utils/env'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'

const FETCH_QUEUE_CONCURRENT = parseInt(env.parallelBlocks) || 50

const paraFetchQueue = new Queue(FETCH_QUEUE_CONCURRENT, Infinity)
const parentFetchQueue = new Queue(FETCH_QUEUE_CONCURRENT, Infinity)

let __storageKey_keys_paras

const processParaBlock = (number) =>
  (async () => {
    const hash = await phalaApi.rpc.chain.getBlockHash(number)
    const blockData = await phalaApi.rpc.chain.getBlock(hash)

    const header = blockData.block.header
    const headerHash = header.hash

    const storageChanges = (
      await phalaApi.rpc.pha.getStorageChanges(headerHash, headerHash)
    )[0]

    const dispatchBlockData = phalaApi.createType('BlockHeaderWithChanges', {
      blockHeader: header,
      storageChanges,
    })

    let parentNumber = -1
    let proof = null

    if (number > 0) {
      const parentHash = await parentApi.rpc.chain.getBlockHash(number)

      const validationData = (
        await phalaApi.query.parachainSystem.validationData.at(hash)
      ).toJSON()

      parentNumber = validationData.relayParentNumber
      proof = (
        await parentApi.rpc.state.getReadProof(
          [__storageKey_keys_paras],
          parentHash
        )
      ).proof
    }

    return {
      number,
      hash,
      header,
      parentNumber,
      dispatchBlockData,
      proof,
    }
  })().catch((e) => {
    $logger.error({ paraBlockNumber: number }, e)
    throw e
  })

const _walkParaBlock = async (paraBlockNumber) => {
  let paraBlock = await getParaBlock(paraBlockNumber)
  if (paraBlock) {
    logger.debug({ paraBlockNumber }, 'ParaBlock found in cache.')
  } else {
    paraBlock = await setParaBlock(
      paraBlockNumber,
      encodeBlockScale(await processParaBlock(paraBlockNumber))
    )
    logger.debug({ paraBlockNumber }, 'Fetched parachain block.')
  }
  await bindBlock(paraBlockNumber, paraBlock.parentNumber)
}

const walkParaBlock = (paraBlockNumber) =>
  paraFetchQueue
    .add(() =>
      promiseRetry(
        (retry, number) => {
          return _walkParaBlock(paraBlockNumber).catch((...args) => {
            logger.warn(
              { paraBlockNumber, retryTimes: number },
              'Failed setting block, retrying...'
            )
            return retry(...args)
          })
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 30000,
        }
      )
    )
    .catch((e) => {
      logger.error({ paraBlockNumber }, e)
      process.exit(-1)
    })

const processParentBlock = (number) =>
  (async () => {
    const hash = await parentApi.rpc.chain.getBlockHash(number)
    const blockData = await parentApi.rpc.chain.getBlock(hash)

    const header = blockData.block.header

    const setId = (await parentApi.query.grandpa.currentSetId.at(hash)).toJSON()

    let justification = blockData.justifications.toJSON()
    if (justification) {
      justification = parentApi.createType(
        'JustificationToSync',
        justification.reduce(
          (acc, current) => (current[0] === FRNK ? current[1] : acc),
          '0x'
        )
      )
    }
    const hasJustification = justification
      ? justification.toHex().length > 2
      : false
    const syncHeaderData = parentApi.createType('HeaderToSync', {
      header,
      justification,
    })

    let authoritySetChange = parentApi.createType(
      'Option<AuthoritySetChange>',
      null
    )
    if (hasJustification) {
      const grandpaAuthorities = parentApi.createType(
        'VersionedAuthorityList',
        (await parentApi.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, hash))
          .value
      )
      const grandpaAuthoritiesStorageProof = (
        await parentApi.rpc.state.getReadProof([GRANDPA_AUTHORITIES_KEY], hash)
      ).proof

      authoritySetChange = parentApi.createType(
        'Option<AuthoritySetChange>',
        parentApi.createType('AuthoritySetChange', {
          authoritySet: {
            authoritySet: grandpaAuthorities.authorityList,
            setId,
          },
          authorityProof: grandpaAuthoritiesStorageProof,
        })
      )
    }

    return {
      number,
      hash,
      header,
      setId,
      hasJustification,
      syncHeaderData,
      authoritySetChange,
    }
  })().catch((e) => {
    $logger.error({ paraBlockNumber: number }, e)
    throw e
  })

const _walkParentBlock = async (parentBlockNumber) => {
  if (await getParentBlockExistance(parentBlockNumber)) {
    logger.debug({ parentBlockNumber }, 'ParentBlock found in cache.')
  } else {
    await setParentBlock(
      parentBlockNumber,
      encodeBlockScale(await processParentBlock(parentBlockNumber))
    )
    logger.debug({ parentBlockNumber }, 'Fetched parent block.')
  }
}

const walkParentBlock = (parentBlockNumber) =>
  parentFetchQueue
    .add(() =>
      promiseRetry(
        (retry, number) => {
          return _walkParentBlock(parentBlockNumber).catch((...args) => {
            logger.warn(
              { parentBlockNumber, retryTimes: number },
              'Failed setting block, retrying...'
            )
            return retry(...args)
          })
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 30000,
        }
      )
    )
    .catch((e) => {
      logger.error({ parentBlockNumber }, e)
      process.exit(-1)
    })

const startSyncPara = (target) => {
  const bufferQueue = new Queue(FETCH_QUEUE_CONCURRENT, Infinity)

  logger.info({ target }, 'Starting synching parachain...')

  for (let number = 1; number < target; number++) {
    bufferQueue.add(() => walkParaBlock(number))
  }
}

const startSyncParent = (start, target) => {
  const bufferQueue = new Queue(FETCH_QUEUE_CONCURRENT, Infinity)

  logger.info({ start, target }, 'Starting synching parent chain...')

  for (let number = start; number < target; number++) {
    bufferQueue.add(() => walkParentBlock(number))
  }
}

const _processGenesis = async (paraId) => {
  const paraNumber = 0
  let parentNumber =
    (
      await phalaApi.query.parachainSystem.validationData.at(
        await phalaApi.rpc.chain.getBlockHash(1)
      )
    ).toJSON().relayParentNumber - 1

  if (!(parentNumber > 0)) {
    parentNumber = 0
  }

  const parentHash = await parentApi.rpc.chain.getBlockHash(parentNumber)
  const parentBlock = await parentApi.rpc.chain.getBlock(parentHash)

  const parentHeader = parentBlock.block.header

  const grandpaAuthorities = parentApi.createType(
    'VersionedAuthorityList',
    (await parentApi.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, parentHash))
      .value
  )
  const grandpaAuthoritiesStorageProof = (
    await parentApi.rpc.state.getReadProof(
      [GRANDPA_AUTHORITIES_KEY],
      parentHash
    )
  ).proof

  const bridgeGenesisInfo = Buffer.from(
    parentApi
      .createType('GenesisInfo', {
        header: parentHeader,
        validators: grandpaAuthorities.authorityList,
        proof: grandpaAuthoritiesStorageProof,
      })
      .toU8a()
  )

  const genesisState = Buffer.from(
    (
      await phalaApi.rpc.state.getPairs(
        '',
        await phalaApi.rpc.chain.getBlockHash(0)
      )
    ).toU8a()
  )

  return {
    paraId,
    paraNumber,
    parentNumber,
    bridgeGenesisInfo,
    genesisState,
  }
}

const processGenesis = async () => {
  const paraId = (await phalaApi.query.parachainInfo.parachainId()).toNumber()
  let genesis = await getGenesis(paraId)
  if (!genesis) {
    logger.info('Fetching genesis...')
    genesis = await setGenesis(await _processGenesis(paraId))
  } else {
    logger.info('Got genesis in cache.')
  }
  return genesis
}

export default async () => {
  await Promise.all([
    setupDb(DB_BLOCK),
    setupParentApi(env.parentChainEndpoint),
    setupPhalaApi(env.chainEndpoint),
  ])

  let paraSyncLock = false
  let parentSyncLock = false

  const genesis = await processGenesis()
  const { paraId, paraNumber, parentNumber } = genesis
  const _genesis = { paraId, paraNumber, parentNumber }
  __storageKey_keys_paras = parentApi.query.paras.heads.key(paraId)
  process.send({ type: SET_GENESIS, payload: _genesis })

  await Promise.all([
    phalaApi.rpc.chain.subscribeFinalizedHeads((header) => {
      const number = header.number.toNumber()
      process.send({ type: SET_PARA_KNOWN_HEIGHT, payload: number })

      if (!paraSyncLock) {
        paraSyncLock = true
        startSyncPara(number)
      }

      walkParaBlock(number)
    }),
    parentApi.rpc.chain.subscribeFinalizedHeads((header) => {
      const number = header.number.toNumber()
      process.send({ type: SET_PARENT_KNOWN_HEIGHT, payload: number })

      if (!parentSyncLock) {
        parentSyncLock = true
        startSyncParent(parentNumber, number)
      }

      walkParentBlock(number)
    }),
  ])

  phalaApi.on('disconnected', () => {
    process.exit(-4)
  })
  parentApi.on('disconnected', () => {
    process.exit(-4)
  })
}

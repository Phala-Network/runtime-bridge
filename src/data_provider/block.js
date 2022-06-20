import { FRNK, GRANDPA_AUTHORITIES_KEY } from '../utils/constants'
import { blake2AsHex } from '@polkadot/util-crypto'
import {
  encodeBlockScale,
  getGenesis,
  getParaBlock,
  getParentBlockExistance,
  setGenesis,
  setParaBlock,
  setParentBlock,
} from './io/block'
import { parentApi, phalaApi } from '../utils/api'
import { u8aToHex } from '@polkadot/util'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'

export const _processGenesis = async (paraId) => {
  const paraNumber = 0
  const parentNumber =
    (
      await phalaApi.query.parachainSystem.validationData.at(
        await phalaApi.rpc.chain.getBlockHash(paraNumber + 1)
      )
    )
      .unwrapOrDefault()
      .relayParentNumber.toJSON() - 1

  const parentHash = await parentApi.rpc.chain.getBlockHash(parentNumber)
  const parentBlock = await parentApi.rpc.chain.getBlock(parentHash)
  const parentHeader = parentBlock.block.header

  const setIdKey = parentApi.query.grandpa.currentSetId.key()
  const setId = await parentApi.query.grandpa.currentSetId.at(parentHash)

  const grandpaAuthorities = parentApi.createType(
    'VersionedAuthorityList',
    (await parentApi.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, parentHash))
      .value
  )
  const grandpaAuthoritiesStorageProof = (
    await parentApi.rpc.state.getReadProof(
      [GRANDPA_AUTHORITIES_KEY, setIdKey],
      parentHash
    )
  ).proof

  const bridgeGenesisInfo = Buffer.from(
    parentApi
      .createType('GenesisInfo', {
        header: parentHeader,
        authoritySet: {
          authoritySet: grandpaAuthorities.authorityList,
          setId,
        },
        proof: grandpaAuthoritiesStorageProof,
      })
      .toU8a()
  )

  const genesisState = Buffer.from(
    (
      await phalaApi.rpc.state.getPairs(
        '',
        await phalaApi.rpc.chain.getBlockHash(paraNumber)
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

export const processGenesis = async () => {
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

export const walkParaBlock = (paraBlockNumber) =>
  promiseRetry(
    (retry, number) =>
      _walkParaBlock(paraBlockNumber).catch((...args) => {
        logger.warn(
          { paraBlockNumber, retryTimes: number },
          'Failed setting block, retrying...'
        )
        return retry(...args)
      }),
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 30000,
    }
  )

const _walkParaBlock = async (paraBlockNumber, _lastHeaderHashHex) => {
  const lastBlock = await getParaBlock(paraBlockNumber)
  if (lastBlock) {
    logger.debug({ paraBlockNumber }, 'ParaBlock found in cache.')
  } else {
    const blockData = await processParaBlock(paraBlockNumber)
    let lastHeaderHashHex = _lastHeaderHashHex
    if (paraBlockNumber < 2 && !lastHeaderHashHex) {
      const lastHeader = phalaApi.createType('Header', lastBlock.header)
      lastHeaderHashHex = u8aToHex(lastHeader.parentHash)
    }
    if (
      paraBlockNumber < 2 ||
      blockData.parentHeaderHashHex !== lastHeaderHashHex
    ) {
      logger.debug(
        { paraBlockNumber },
        '_walkParaBlock: parent header hash mismatch, the database of current Substrate node may be corrupted.'
      )
      process.exit(255)
    }

    await setParaBlock(paraBlockNumber, encodeBlockScale(blockData))
    logger.debug({ paraBlockNumber }, 'Fetched parachain block.')
    return blockData.headerHashHex
  }
}

const processParaBlock = (number) =>
  (async () => {
    const startTime = Date.now()

    const getBlockHashStartTime = Date.now()
    const hash = await phalaApi.rpc.chain.getBlockHash(number)
    const hashHex = hash.toHex()
    const hashHexAlt = u8aToHex(hash)

    const getHeaderStartTime = Date.now()
    const header = await phalaApi.rpc.chain.getHeader(hash)

    if (hashHexAlt !== blake2AsHex(header.toU8a())) {
      logger.error(
        { number },
        new Error(
          'processParaBlock: header hash mismatch, the database of current Substrate node may be corrupted.'
        )
      )
      process.exit(254)
    }

    const storageChangeStartTime = Date.now()
    const rawStorageChanges = await phalaApi._rpcCore.provider.send(
      'pha_getStorageChangesAt',
      [hashHex],
      false
    )

    const endTime = Date.now()
    logger.debug(
      {
        getBlockHash: getHeaderStartTime - getBlockHashStartTime,
        getHeader: storageChangeStartTime - getHeaderStartTime,
        getStorageChangesAt: endTime - storageChangeStartTime,
      },
      `timing: processParaBlock(${number}): fetched from chain using ${
        endTime - startTime
      }ms`
    )

    const dispatchBlockData = phalaApi.createType('BlockHeaderWithChanges', {
      blockHeader: header,
      storageChanges: rawStorageChanges,
    })
    return {
      number,
      hash,
      header,
      headerHashHex: hashHexAlt,
      parentHeaderHashHex: u8aToHex(header.parentHash),
      dispatchBlockData,
    }
  })().catch((e) => {
    logger.error({ paraBlockNumber: number }, e)
    throw e
  })

export const walkParentBlock = (parentBlockNumber, paraId, proofKey) =>
  promiseRetry(
    (retry, number) => {
      return _walkParentBlock(parentBlockNumber, paraId, proofKey).catch(
        (...args) => {
          logger.warn(
            { parentBlockNumber, retryTimes: number },
            'Failed setting block, retrying...'
          )
          return retry(...args)
        }
      )
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 30000,
    }
  )

const _walkParentBlock = async (parentBlockNumber, paraId, proofKey) => {
  if (await getParentBlockExistance(parentBlockNumber)) {
    logger.debug({ parentBlockNumber }, 'ParentBlock found in cache.')
  } else {
    await setParentBlock(
      parentBlockNumber,
      encodeBlockScale(
        await processParentBlock(parentBlockNumber, paraId, proofKey)
      )
    )
    logger.debug({ parentBlockNumber }, 'Fetched parent block.')
  }
}

const processParentBlock = (number, paraId, proofKey) =>
  (async () => {
    const hash = await parentApi.rpc.chain.getBlockHash(number)
    const blockData = await parentApi.rpc.chain.getBlock(hash)

    const header = blockData.block.header
    const parentApiAt = await parentApi.at(hash)

    const setId = (await parentApiAt.query.grandpa.currentSetId()).toJSON()
    const paraNumber = phalaApi
      .createType(
        'Header',
        (await parentApiAt.query.paras.heads(paraId)).unwrapOrDefault()
      )
      .number.toJSON()

    const paraProof = (await parentApi.rpc.state.getReadProof([proofKey], hash))
      .proof

    let hasJustification = false
    let justification

    if (blockData.justifications.isSome) {
      justification = parentApi.createType(
        'JustificationToSync',
        blockData.justifications
          .toJSON()
          .reduce(
            (acc, current) => (current[0] === FRNK ? current[1] : acc),
            '0x'
          )
      )
      hasJustification = justification ? justification.isSome : false
    }

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
      paraNumber,
      paraProof,
    }
  })().catch((e) => {
    logger.error({ paraBlockNumber: number }, e)
    throw e
  })

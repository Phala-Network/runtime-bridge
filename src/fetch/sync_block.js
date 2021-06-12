import Finity from 'finity'
import pQueue from 'p-queue'
import { DB_BLOB, DB_BLOCK, setupDb } from '../io/db'
import { setupPhalaApi, phalaApi } from '../utils/api'
import env from '../utils/env'
import toEnum from '../utils/to_enum'
import {
  FRNK,
  GRANDPA_AUTHORITIES_KEY,
  APP_RECEIVED_HEIGHT,
  APP_VERIFIED_HEIGHT,
  EVENTS_STORAGE_KEY,
  FETCH_IS_SYNCHED,
} from '../utils/constants'
import {
  decodeBlock,
  encodeBlock,
  getGenesisBlock,
  setGenesisBlock,
} from '../io/block'
import logger from '../utils/logger'

const { default: Queue } = pQueue

const STATES = toEnum([
  'IDLE',
  'SYNCHING_OLD_BLOCKS',
  'SYNCHING_FINALIZED',
  'ERROR',
])

const EVENTS = toEnum([
  'RECEIVING_BLOCK_HEADER',
  'FINISHING_SYNCHING_OLD_BLOCKS',
])

const processBlock = (blockNumber) =>
  (async () => {
    const hash = await phalaApi.rpc.chain.getBlockHash(blockNumber)
    const blockData = await phalaApi.rpc.chain.getBlock(hash)

    const header = blockData.block.header
    const headerHash = header.hash

    const setId = (await phalaApi.query.grandpa.currentSetId.at(hash)).toJSON()

    let justification = blockData.justifications.toJSON()
    if (justification) {
      justification = phalaApi.createType(
        'JustificationToSync',
        justification.reduce(
          (acc, current) => (current[0] === FRNK ? current[1] : acc),
          '0x'
        )
      )
    }

    const events = (
      await phalaApi.rpc.state.getStorage(phalaApi.eventsStorageKey, hash)
    ).value
    let isNewRound = false
    if (blockNumber > 0) {
      const records = phalaApi.createType('Vec<EventRecord>', events)
      isNewRound = records.reduce(
        (acc, current) =>
          current.event.section === 'phala' &&
          current.event.method === 'NewMiningRound'
            ? true
            : acc,
        false
      )
    }

    const storageChanges = (
      await phalaApi.rpc.pha.getStorageChanges(headerHash, headerHash)
    )[0]

    const syncHeaderData = phalaApi.createType('HeaderToSync', {
      header,
      justification,
    })

    const dispatchBlockData = phalaApi.createType('BlockHeaderWithEvents', {
      blockHeader: header,
      storageChanges,
    })

    return {
      blockNumber,
      hash,
      header,
      headerHash,
      setId,
      isNewRound,
      hasJustification: justification
        ? justification.toHex().length > 2
        : false,
      syncHeaderData,
      dispatchBlockData,
    }
  })().catch((e) => {
    $logger.error({ blockNumber }, e)
    throw e
  })

const processGenesisBlock = async () => {
  const block = await processBlock(0)
  block.genesisState = await phalaApi.rpc.state.getPairs('', block.hash)

  const grandpaAuthorities = (
    await phalaApi.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, block.hash)
  ).value
  const grandpaAuthoritiesStorageProof = (
    await phalaApi.rpc.state.getReadProof([GRANDPA_AUTHORITIES_KEY], block.hash)
  ).proof

  block.bridgeGenesisInfo = phalaApi.createType('GenesisInfo', {
    header: block.header,
    validators: grandpaAuthorities.authorityList,
    proof: grandpaAuthoritiesStorageProof,
  })

  return block
}

const fetchQueue = new Queue({
  concurrency: parseInt(env.parallelBlocks) || 50,
  interval: 1,
  timeout: 60 * 1000,
  throwOnTimeout: true,
})

export default async () => {
  await setupDb([DB_BLOCK])
  await setupPhalaApi(env.chainEndpoint)

  // const CHAIN_APP_RECEIVED_HEIGHT = `${phalaApi.phalaChain}:${APP_RECEIVED_HEIGHT}`
  // const CHAIN_APP_VERIFIED_HEIGHT = `${phalaApi.phalaChain}:${APP_VERIFIED_HEIGHT}`

  // let oldHighest = 0

  if (await getGenesisBlock()) {
    logger.info('Genesis block found in cache.')
  } else {
    await setGenesisBlock(encodeBlock(await processGenesisBlock()))
    logger.info('Fetched genesis block.')
  }

  await phalaApi.rpc.chain.subscribeFinalizedHeads(() => {})

  phalaApi.on('disconnected', () => {
    process.exit(-4)
  })
}

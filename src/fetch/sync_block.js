import { DB_BLOCK, setupDb } from '../io/db'
import { FETCH_REACHED_TARGET, FETCH_RECEIVED_HEIGHT } from './index'
import { FRNK, GRANDPA_AUTHORITIES_KEY } from '../utils/constants'
import {
  encodeBlock,
  getBlock,
  getGenesisBlock,
  setBlock,
  setGenesisBlock,
} from '../io/block'
import { phalaApi, setupPhalaApi } from '../utils/api'
import Queue from 'promise-queue'
import env from '../utils/env'
import logger from '../utils/logger'
import promiseRetry from 'promise-retry'

const FETCH_QUEUE_CONCURRENT = parseInt(env.parallelBlocks) || 50

let startLock = false
const fetchQueue = new Queue(FETCH_QUEUE_CONCURRENT, Infinity)

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

    const hasJustification = justification
      ? justification.toHex().length > 2
      : false

    let authoritySetChange = phalaApi.createType(
      'Option<AuthoritySetChange>',
      null
    )
    if (hasJustification) {
      const grandpaAuthorities = (
        await phalaApi.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, hash)
      ).value
      const grandpaAuthoritiesStorageProof = (
        await phalaApi.rpc.state.getReadProof([GRANDPA_AUTHORITIES_KEY], hash)
      ).proof

      authoritySetChange = phalaApi.createType(
        'Option<AuthoritySetChange>',
        phalaApi.createType('AuthoritySetChange', {
          authoritySet: {
            authoritySet: grandpaAuthorities.authorityList,
            setId,
          },
          authorityProof: grandpaAuthoritiesStorageProof,
        })
      )
    }

    return {
      blockNumber,
      hash,
      header,
      headerHash,
      setId,
      isNewRound,
      hasJustification,
      syncHeaderData,
      dispatchBlockData,
      authoritySetChange,
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
  )

  block.bridgeGenesisInfo = phalaApi.createType('GenesisInfo', {
    header: block.header,
    validators: grandpaAuthorities.authorityList,
    proof: grandpaAuthoritiesStorageProof,
  })

  return block
}

const _walkBlock = async (blockNumber) => {
  logger.debug({ blockNumber }, 'Starting fetching block...')
  if (await getBlock(blockNumber)) {
    logger.info({ blockNumber }, 'Block found in cache.')
  } else {
    await setBlock(blockNumber, encodeBlock(await processBlock(blockNumber)))
    logger.info({ blockNumber }, 'Fetched block.')
  }
}

const walkBlock = (blockNumber) =>
  fetchQueue
    .add(() =>
      promiseRetry(
        (retry, number) => {
          return _walkBlock(blockNumber).catch((...args) => {
            logger.warn(
              { blockNumber, retryTimes: number },
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
      logger.error({ blockNumber }, e)
      process.exit(-1)
    })

const startSync = (target) => {
  const bufferQueue = new Queue(
    parseInt(FETCH_QUEUE_CONCURRENT * 1.618),
    Infinity,
    {
      onEmpty: () => {
        if (!bufferQueue.getPendingLength() && !bufferQueue.getQueueLength()) {
          logger.info({ target }, 'Synched to init target height...')
          process.send({ [FETCH_REACHED_TARGET]: target })
        }
      },
    }
  )

  logger.info({ target }, 'Starting synching...')

  for (let number = 1; number < target; number++) {
    bufferQueue.add(() => walkBlock(number))
  }
}

export default async () => {
  if (startLock) {
    throw new Error('Unexpected re-initialization.')
  }
  await setupDb([DB_BLOCK])
  await setupPhalaApi(env.chainEndpoint)

  let syncLock = false

  if (await getGenesisBlock()) {
    logger.info('Genesis block found in cache.')
  } else {
    await setGenesisBlock(encodeBlock(await processGenesisBlock()))
    logger.info('Fetched genesis block.')
  }

  await phalaApi.rpc.chain.subscribeFinalizedHeads((header) => {
    const number = header.number.toNumber()

    if (!syncLock) {
      syncLock = true
      startSync(number)
    }

    walkBlock(number).then(() => {
      process.send({ [FETCH_RECEIVED_HEIGHT]: number })
    })
  })

  phalaApi.on('disconnected', () => {
    process.exit(-4)
  })
}

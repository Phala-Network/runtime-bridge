import toEnum from "@/utils/to_enum"
import Finity from "finity"
import pQueue from 'p-queue'
import cluster from 'cluster'

import wait from '@/utils/wait'

import { FRNK, GRANDPA_AUTHORITIES_KEY, APP_RECEIVED_HEIGHT, APP_VERIFIED_HEIGHT, EVENTS_STORAGE_KEY } from "@/utils/constants"

const { default: Queue } = pQueue

const STATES = toEnum([
  'IDLE',
  'SYNCHING_OLD_BLOCKS',
  'SYNCHING_FINALIZED',
  'ERROR'
])

const EVENTS = toEnum([
  'RECEIVING_BLOCK_HEADER',
  'FINISHING_SYNCHING_OLD_BLOCKS'
])

const tryGetBlockExistence = (BlockModel, number) => {
  return BlockModel.count({ number })
    .then(i => !!i)
    .catch(e => {
      if (e.message === 'path exists') {
        $logger.warn('Index not found, retrying in 10s...')
        return wait(10000).then(() => tryGetBlockExistence(BlockModel, number))
      }
      $logger.error('tryGetBlockExistence', e, { number })
      process.exit(-2)
    })
}

const _setBlock = async ({ api, number, timeout = 1, chainName, BlockModel, eventsStorageKey }) => {
  await wait(timeout)
  const block = await tryGetBlockExistence(BlockModel, number)

  if (!block) {
    const hash = (await api.rpc.chain.getBlockHash(number)).toHex()
    const blockData = await api.rpc.chain.getBlock(hash)
    let justification = blockData.justifications.toJSON()
    if (justification) {
      justification = justification
        .reduce((acc, current) =>
          current[0] === FRNK
            ? current[1]
            : acc, undefined)
    }

    const events = (await api.rpc.state.getStorage(eventsStorageKey, hash)).value.toHex()
    const eventsStorageProof = (await api.rpc.state.getReadProof([eventsStorageKey], hash)).proof.toHex()
    const grandpaAuthorities = (await api.rpc.state.getStorage(GRANDPA_AUTHORITIES_KEY, hash)).value.toHex()
    const grandpaAuthoritiesStorageProof = (await api.rpc.state.getReadProof([GRANDPA_AUTHORITIES_KEY], hash)).proof.toHex()
    const setId = (await api.query.grandpa.currentSetId.at(hash)).toJSON()

    await BlockModel.create({
      number,
      hash,
      header: blockData.block.header.toHex(),
      justification,
      events,
      eventsStorageProof,
      grandpaAuthorities,
      grandpaAuthoritiesStorageProof,
      setId
    })
    $logger.info({ chain: chainName }, `Fetched block #${number}.`)
  } else {
    $logger.info({ chain: chainName }, `Block #${number} found in cache.`)
  }
  return
}
const setBlock = (...args) => {
  return _setBlock(...args)
    .catch(e => {
      $logger.error(e, { number })
      process.exit(-2)
    })
}

const _syncBlock = async ({ api, redis, chainName, BlockModel, parallelBlocks, resolve }) => {
  let oldHighest = 0
  const CHAIN_APP_RECEIVED_HEIGHT = `${chainName}:${APP_RECEIVED_HEIGHT}`
  const CHAIN_APP_VERIFIED_HEIGHT = `${chainName}:${APP_VERIFIED_HEIGHT}`
  const CHAIN_EVENTS_STORAGE_KEY = `${chainName}:${EVENTS_STORAGE_KEY}`

  const eventsStorageKey = api.query.system.events.key()

  const fetchQueue = new Queue({
    concurrency: parallelBlocks,
    interval: 1,
    timeout: 60*1000,
    throwOnTimeout: true
  })

  const syncOldBlocks = async () => {
    await redis.set(CHAIN_EVENTS_STORAGE_KEY, eventsStorageKey)

    const queue = new Queue({ concurrency: 60, interval: 1 })
    globalThis.$q = queue

    const verifiedHeight = (parseInt(await redis.get(CHAIN_APP_VERIFIED_HEIGHT)) || 1) - 1
    $logger.info(`${CHAIN_APP_VERIFIED_HEIGHT}: ${verifiedHeight}`)

    const worker = cluster.fork({ INIT_HEIGHT: oldHighest })
    worker.on('online', () => {
      $logger.info('Started worker for organizing blob...')
    })
    worker.on('exit', (code, signal) => {
      if (signal) {
        console.log(`worker was killed by signal: ${signal}`)
      } else if (code !== 0) {
        console.log(`worker exited with error code: ${code}`)
      } else {
        console.log('worker success!')
      }
      process.exit(code)
    })

    for (let number = verifiedHeight; number < oldHighest; number++) {
      queue.add(() => setBlock({ api, redis, number, chainName, BlockModel, eventsStorageKey, fetchQueue }))
    }

    await queue.onIdle().catch(console.error)
    await redis.set(CHAIN_APP_VERIFIED_HEIGHT, oldHighest)
    $logger.info(`${CHAIN_APP_VERIFIED_HEIGHT}: ${await redis.get(CHAIN_APP_VERIFIED_HEIGHT)}`)

    return
  }

  const stateMachine = Finity.configure()

  stateMachine.initialState(STATES.IDLE)
    .on(EVENTS.RECEIVING_BLOCK_HEADER)
      .transitionTo(STATES.SYNCHING_OLD_BLOCKS)
      .withAction((...{ 2: { eventPayload: header } }) => {
        $logger.info({ chain: chainName }, 'Start synching blocks...It may take a long time...')
        oldHighest = header.number.toNumber()
      })

  stateMachine.state(STATES.SYNCHING_OLD_BLOCKS)
    .do(() => syncOldBlocks())
      .onSuccess().transitionTo(STATES.SYNCHING_FINALIZED).withAction(() => {
        $logger.info({ chain: chainName }, 'Old blocks synched.')
        resolve()
      })
      .onFailure().transitionTo(STATES.ERROR).withAction((from, to, context) => {
        console.error('error', context.error)
        $logger.error({ chain: chainName }, context.error)
      })
    .onAny().ignore()

  stateMachine.state(STATES.SYNCHING_FINALIZED)
    .onAny().ignore()

  stateMachine.state(STATES.ERROR)
    .do(() => process.exit(-2))
      .onSuccess().selfTransition()
    .onAny().ignore()

  const worker = stateMachine.start()

  const onSub = header => {
    const number = header.number.toNumber()

    if (oldHighest <= 0) {
      worker.handle(EVENTS.RECEIVING_BLOCK_HEADER, header)
    }
    $redis.set(CHAIN_APP_RECEIVED_HEIGHT, number)

    setBlock({ api, redis, number, chainName, BlockModel, eventsStorageKey, fetchQueue })
  }

  await api.rpc.chain.subscribeFinalizedHeads(onSub)

  api.on('disconnected', () => {
    process.exit(-4)
  })
}

const syncBlock = ({ api, redis, chainName, BlockModel, parallelBlocks }) =>
  new Promise(resolve =>
    _syncBlock({ api, redis, chainName, BlockModel, parallelBlocks, resolve }))

export default syncBlock

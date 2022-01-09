import { DB_BLOCK, setupDb } from './io/db'
import {
  getLastCommittedParaBlock,
  getLastCommittedParentBlock,
} from './io/window'
import {
  parentApi,
  phalaApi,
  setupParentApi,
  setupPhalaApi,
} from '../utils/api'
import { processGenesis, walkParaBlock, walkParentBlock } from './block'
import { send } from './ipc'
import PQueue from 'p-queue'
import env from '../utils/env'
import logger from '../utils/logger'
import wait from '../utils/wait'
import type { BlockHash } from '@polkadot/types/interfaces'
import type { U32 } from '@polkadot/types'
import type { prb } from '@phala/runtime-bridge-walkie'

const FETCH_PARENT_QUEUE_CONCURRENT = parseInt(env.parallelParentBlocks) || 15

const start = async () => {
  await setupDb(DB_BLOCK)
  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)

  const genesis = await processGenesis()

  let lastParaFinalizedHeadHash: BlockHash
  let paraTarget: number
  let lastParentFinalizedHeadHash: BlockHash
  let parentTarget: number

  const updateParaTarget = async () => {
    const newHeadHash = await phalaApi.rpc.chain.getFinalizedHead()
    if (newHeadHash.eq(lastParaFinalizedHeadHash)) {
      return false
    }
    lastParaFinalizedHeadHash = newHeadHash
    paraTarget = (
      (await (
        await phalaApi.at(lastParaFinalizedHeadHash)
      ).query.system.number()) as U32
    ).toNumber()
    send('setParaTarget', paraTarget)
  }
  const updateParentTarget = async () => {
    const newHeadHash = await parentApi.rpc.chain.getFinalizedHead()
    if (newHeadHash.eq(lastParentFinalizedHeadHash)) {
      return false
    }
    lastParentFinalizedHeadHash = newHeadHash
    parentTarget = (
      (await (
        await parentApi.at(lastParentFinalizedHeadHash)
      ).query.system.number()) as U32
    ).toNumber()
    send('setParentTarget', parentTarget)
  }
  const updateTarget = async (): Promise<void> => {
    if (process.env.SYNC_TYPE === 'para') {
      await updateParaTarget()
    }
    if (process.env.SYNC_TYPE === 'parent') {
      await updateParentTarget()
    }
    setTimeout(
      () =>
        updateTarget().catch((e) => {
          logger.error('Failed to update target:', e)
        }),
      3000
    )
  }

  const proofKey = parentApi.query.paras.heads.key(genesis.paraId)

  await updateTarget()

  if (process.env.SYNC_TYPE === 'para') {
    iteratePara(() => paraTarget).catch((e) => {
      logger.error(e)
      process.exit(255)
    })
  }

  if (process.env.SYNC_TYPE === 'parent') {
    iterate(
      (await getLastCommittedParentBlock()) || genesis.parentNumber,
      () => parentTarget,
      async (curr) => {
        await walkParentBlock(curr, genesis.paraId, proofKey)
        send('setParentFetchedHeight', curr)
      }
    ).catch((e) => {
      logger.error(e)
      process.exit(255)
    })
  }
}

const iteratePara = async (getTarget: () => number) => {
  let i = (await getLastCommittedParaBlock()) - 1
  let currPromise: Promise<prb.db.IParaBlock> = Promise.resolve({})
  async function* paraIterable(): AsyncGenerator<number, void, void> {
    while (true) {
      await currPromise
      if (getTarget() > i) {
        i += 1
        yield i
      } else {
        await wait(1000)
      }
    }
  }
  for await (const curr of paraIterable()) {
    currPromise = walkParaBlock(curr)
    await currPromise
    send('setParaFetchedHeight', curr)
  }
}

export const iterate = async (
  startNum: number,
  getTarget: () => number,
  queueFn: (curr: number) => Promise<void>
) => {
  let curr = startNum - 1
  let currentPromise = Promise.resolve()

  async function* iterable(): AsyncGenerator<number, void, void> {
    while (true) {
      await currentPromise
      if (getTarget() > curr) {
        curr += 1
        yield curr
      } else {
        await wait(1000)
      }
    }
  }
  for await (const curr of iterable()) {
    currentPromise = queueFn(curr)
  }
}

export default start

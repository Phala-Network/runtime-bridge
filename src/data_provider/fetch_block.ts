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

const FETCH_PARENT_QUEUE_CONCURRENT = parseInt(env.parallelParentBlocks) || 15
const FETCH_PARA_QUEUE_CONCURRENT = parseInt(env.parallelParaBlocks) || 2

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
    await Promise.all([updateParaTarget(), updateParentTarget()])
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

  iterate(
    await getLastCommittedParaBlock(),
    () => paraTarget,
    FETCH_PARA_QUEUE_CONCURRENT,
    async (curr) => {
      await walkParaBlock(curr)
      send('setParaFetchedHeight', curr)
    }
  ).catch((e) => {
    logger.error(e)
    process.exit(255)
  })

  iterate(
    (await getLastCommittedParentBlock()) || genesis.parentNumber,
    () => parentTarget,
    FETCH_PARENT_QUEUE_CONCURRENT,
    async (curr) => {
      await walkParentBlock(curr, genesis.paraId, proofKey)
      send('setParentFetchedHeight', curr)
    }
  ).catch((e) => {
    logger.error(e)
    process.exit(255)
  })
}

export const iterate = async (
  startNum: number,
  getTarget: () => number,
  concurrency: number,
  queueFn: (curr: number) => Promise<void>
) => {
  let curr = startNum
  let errorBoundaryReject: (e: Error) => void
  const errorBoundary = new Promise((resolve, reject) => {
    errorBoundaryReject = reject
  })

  const queue = new PQueue({
    concurrency,
  })

  async function* iterable(): AsyncGenerator<number, void, void> {
    while (true) {
      if (queue.size <= concurrency * 2 && getTarget() >= curr) {
        yield curr
        curr += 1
      } else {
        await wait(100)
      }
    }
  }
  for await (const curr of iterable()) {
    queue.add(() => queueFn(curr)).catch((e: Error) => errorBoundaryReject(e))
  }
  return errorBoundary
}

export default start
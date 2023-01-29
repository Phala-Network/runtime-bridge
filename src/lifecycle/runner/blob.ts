import { NOT_FOUND_ERROR } from '../../data_provider/io/db'
import {
  blobQueueSize,
  disableLru,
  lruCacheDebugLogInterval,
  lruCacheMaxAge,
  lruCacheSize,
} from '../env'
import { pbToObject } from '../../data_provider/io/db_encoding'
import { prb } from '@phala/runtime-bridge-walkie'
import { waitForDataProvider } from './ptp'
import LRU from 'lru-cache'
import PQueue from 'p-queue'
import logger from '../../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'
import type { LifecycleRunnerPtpNode } from './ptp'
import type { Message } from 'protobufjs'
import RangeMeta = prb.db.RangeMeta
import IRangeMeta = prb.db.IRangeMeta

const queue = new PQueue({ concurrency: blobQueueSize })

const PRIORITY_META = 50
// const PRIORITY_META_HURRY = 20
const PRIORITY_HEADER_BLOB = 100
const PRIORITY_PARA_BLOB = 101

type PromiseStore<T> = { [k: string]: Promise<T | null> }
const promiseStore: PromiseStore<Buffer | Uint8Array> = {}

const cache = new LRU({
  max: lruCacheSize,
  ttl: lruCacheMaxAge,
})

if (lruCacheDebugLogInterval > 0) {
  let prevLength = -1
  setInterval(() => {
    if (prevLength !== cache.size) {
      logger.info(`LRU cache length: ${cache.size}`)
    }
    prevLength = cache.size
  }, lruCacheDebugLogInterval)
}

const _getBuffer = async (ptpNode: LifecycleRunnerPtpNode, key: string) => {
  const dataProvider = await waitForDataProvider(ptpNode)
  const dpConn = await ptpNode.dpManager.getConnection(dataProvider)
  return dpConn.get(key)
}

const getBuffer = async (
  ptpNode: LifecycleRunnerPtpNode,
  key: string,
  priority: number
) => {
  if (promiseStore[key]) {
    return await promiseStore[key]
  }

  promiseStore[key] = queue.add(() => _getBuffer(ptpNode, key), {
    priority,
  })

  try {
    const ret = await promiseStore[key]
    delete promiseStore[key]
    return ret
  } catch (e) {
    delete promiseStore[key]
    throw e
  }
}

const _getCachedBuffer = async (
  ptpNode: LifecycleRunnerPtpNode,
  key: string,
  priority: number
) => {
  const ret = await getBuffer(ptpNode, key, priority)

  if (!disableLru) {
    if (ret) {
      cache.set(key, ret)
    }
  }

  return ret
}

const getCachedBuffer = async (
  ptpNode: LifecycleRunnerPtpNode,
  key: string,
  priority: number
) => {
  if (!disableLru) {
    const cached = cache.get(key)

    if (typeof cached !== 'undefined') {
      return cached as Uint8Array
    }
  }

  return _getCachedBuffer(ptpNode, key, priority)
}

type WaitFn<T> = (...args: unknown[]) => Promise<T>

const _waitFor = async <T>(waitFn: WaitFn<T>): Promise<T> => {
  try {
    const ret = await waitFn()
    if (!ret) {
      throw NOT_FOUND_ERROR
    }
    return ret
  } catch (e) {
    if (e === NOT_FOUND_ERROR) {
      await wait(2000)
      return _waitFor(waitFn)
    }
    throw e
  }
}

const waitFor = <T>(waitFn: WaitFn<T>) =>
  promiseRetry(
    (retry, retriedTimes) =>
      _waitFor(waitFn).catch((e: Error) => {
        logger.error({ retriedTimes }, e)
        return retry(e)
      }),
    {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 12000,
    }
  )

export const waitForCachedBuffer = async (
  ptpNode: LifecycleRunnerPtpNode,
  key: string,
  priority: number
): Promise<Uint8Array> => {
  const buffer = await getCachedBuffer(ptpNode, key, priority)
  if (buffer) {
    return buffer
  }
  await wait(1000)
  return waitForCachedBuffer(ptpNode, key, priority)
}

const waitForRangeByParentNumber = async (
  ptpNode: LifecycleRunnerPtpNode,
  number: number,
  cached: boolean,
  priority: number
) =>
  waitFor(async () => {
    logger.debug({ number, cached, priority }, 'waitForRangeByParentNumber')
    const buffer = await (cached ? getCachedBuffer : getBuffer)(
      ptpNode,
      `rangeByParentBlock:${number}:pb`,
      priority
    )
    if (!buffer) {
      return null
    }
    const pb = RangeMeta.decode(buffer)
    return pbToObject(pb as unknown as Message<IRangeMeta>)
  })

const waitForParaBlockRange = async (
  ptpNode: LifecycleRunnerPtpNode,
  number: number,
  cached: boolean
) =>
  waitFor(async () => {
    const buffer = await (cached ? getCachedBuffer : getBuffer)(
      ptpNode,
      `rangeParaBlock:key:${number}`,
      PRIORITY_META
    )
    if (!buffer) {
      return null
    }
    return JSON.parse(Buffer.from(buffer).toString('utf-8'))
  })

type Uint8ArrayWithMeta = Uint8Array & { meta?: { [k: string]: unknown } }
type Uint8ArrayListWithMeta = Uint8Array[] & { meta?: { [k: string]: unknown } }

export const getHeaderBlob = async (
  ptpNode: LifecycleRunnerPtpNode,
  blockNumber: number,
  currentCommittedNumber: number,
  paraHeaderSyncNumber = -1
) => {
  logger.debug(
    { blockNumber, currentCommittedNumber, paraHeaderSyncNumber },
    `pre waitForRangeByParentNumber`
  )
  const meta = await waitForRangeByParentNumber(
    ptpNode,
    blockNumber,
    currentCommittedNumber - blockNumber > 600,
    PRIORITY_META
  )
  const bufferKey =
    paraHeaderSyncNumber === 1
      ? meta.drySyncHeaderReqKey
      : meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey
  const ret: Uint8ArrayListWithMeta = []
  ret.push(await getCachedBuffer(ptpNode, bufferKey, PRIORITY_HEADER_BLOB))

  logger.debug(`Byte length of ${bufferKey}: ${ret[0]?.length || 0}`)

  ret.meta = meta
  return ret
}

export const getParaBlockBlob = async (
  ptpNode: LifecycleRunnerPtpNode,
  blockNumber: number,
  headerSynchedTo: number,
  currentCommittedNumber: number
) => {
  const meta = await waitForParaBlockRange(
    ptpNode,
    blockNumber,
    currentCommittedNumber - blockNumber > 300 &&
      currentCommittedNumber - headerSynchedTo > 300
  )
  const dryKey = `dryParaBlock:${blockNumber}`
  const retKey =
    meta.bufferKey && headerSynchedTo >= meta.lastBlockNumber
      ? meta.bufferKey || dryKey
      : dryKey

  const ret = (await getCachedBuffer(
    ptpNode,
    retKey,
    PRIORITY_PARA_BLOB
  )) as Uint8ArrayWithMeta
  ret.meta = meta
  return ret
}

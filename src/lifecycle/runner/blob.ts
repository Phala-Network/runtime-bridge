import { NOT_FOUND_ERROR } from '../../data_provider/io/db'
import { lruCacheDebugLogInterval, lruCacheMaxAge, lruCacheSize } from '../env'
import { pbToObject } from '../../data_provider/io/db_encoding'
import { prb } from '@phala/runtime-bridge-walkie'
import { waitForDataProvider } from './ptp'
import LRU from 'lru-cache'
import PQueue from 'p-queue'
import logger from '../../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'
import type { Message } from 'protobufjs'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'
import RangeMeta = prb.db.RangeMeta
import IRangeMeta = prb.db.IRangeMeta

const largeBlobQueue = new PQueue({ concurrency: 10 })

const cache = new LRU({
  max: lruCacheSize,
  maxAge: lruCacheMaxAge,
})

if (lruCacheDebugLogInterval > 0) {
  let prevLength = -1
  setInterval(() => {
    if (prevLength !== cache.length) {
      logger.info(`LRU cache length: ${cache.length}`)
    }
    prevLength = cache.length
  }, lruCacheDebugLogInterval)
}

const getBuffer = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  key: string
) => {
  const dataProvider = await waitForDataProvider(ptpNode)

  const response = await largeBlobQueue.add(async () =>
    dataProvider.dial('GetBlobByKey', { key })
  )
  if (response.hasError) {
    throw response.error
  }
  return response.data.data
}

const getCachedBuffer = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  key: string
) => {
  const cached = cache.get(key)

  if (typeof cached !== 'undefined') {
    return cached as Uint8Array
  }
  const ret = await getBuffer(ptpNode, key)
  if (!ret) {
    cache.set(key, ret)
  }
  return ret
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

const waitForCachedBuffer = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  key: string
): Promise<Uint8Array> => {
  const buffer = await getCachedBuffer(ptpNode, key)
  if (buffer) {
    return buffer
  }
  await wait(1000)
  return waitForCachedBuffer(ptpNode, key)
}

const waitForRangeByParentNumber = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  number: number
) =>
  waitFor(async () => {
    const buffer = await getBuffer(ptpNode, `rangeByParentBlock:${number}:pb`)
    if (!buffer) {
      return null
    }
    const pb = RangeMeta.decode(buffer)
    return pbToObject(pb as unknown as Message<IRangeMeta>)
  })

const waitForParaBlockRange = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  number: number
) =>
  waitFor(async () => {
    const buffer = await getBuffer(ptpNode, `rangeParaBlock:key:${number}`)
    if (!buffer) {
      return null
    }
    return JSON.parse(Buffer.from(buffer).toString('utf-8'))
  })

type Uint8ArrayWithMeta = Uint8Array & { meta?: { [k: string]: unknown } }
type Uint8ArrayListWithMeta = Uint8Array[] & { meta?: { [k: string]: unknown } }

export const getHeaderBlob = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  blockNumber: number
) => {
  const meta = await waitForRangeByParentNumber(ptpNode, blockNumber)
  const ret: Uint8ArrayListWithMeta = []
  if (blockNumber === meta.parentStartBlock) {
    ret.push(
      await getCachedBuffer(
        ptpNode,
        meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey
      )
    )
  } else {
    ret.push(await getCachedBuffer(ptpNode, meta.drySyncHeaderReqKey))
  }
  ret.meta = meta
  return ret
}

export const getParaBlockBlob = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  blockNumber: number,
  headerSynchedTo: number
) => {
  const meta = await waitForParaBlockRange(ptpNode, blockNumber)
  const dryKey = `dryParaBlock:${blockNumber}`
  const retKey =
    meta.bufferKey && headerSynchedTo >= meta.lastBlockNumber
      ? meta.bufferKey || dryKey
      : dryKey

  const ret = (await getCachedBuffer(ptpNode, retKey)) as Uint8ArrayWithMeta
  ret.meta = meta
  return ret
}

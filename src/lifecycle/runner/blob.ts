import { NOT_FOUND_ERROR } from '../../data_provider/io/db'
import {
  blobQueueSize,
  lruCacheDebugLogInterval,
  lruCacheMaxAge,
  lruCacheSize,
} from '../env'
import { isDev } from '../../utils/env'
import { pbToObject } from '../../data_provider/io/db_encoding'
import { prb } from '@phala/runtime-bridge-walkie'
import { waitForDataProvider } from './ptp'
import LRU from 'lru-cache'
import PQueue from 'p-queue'
import crc32 from 'crc/calculators/crc32'
import logger from '../../utils/logger'
import promiseRetry from 'promise-retry'
import wait from '../../utils/wait'
import type { Message } from 'protobufjs'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'
import RangeMeta = prb.db.RangeMeta
import IRangeMeta = prb.db.IRangeMeta

const queue = new PQueue({ concurrency: blobQueueSize })

const PRIORITY_META = 10
// const PRIORITY_META_HURRY = 20
const PRIORITY_HEADER_BLOB = 100
const PRIORITY_PARA_BLOB = 100

type PromiseStore<T> = { [k: string]: Promise<T | null> }
const promiseStore: PromiseStore<Buffer | Uint8Array> = {}

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
  key: string,
  priority: number
) => {
  if (promiseStore[key]) {
    return await promiseStore[key]
  }

  promiseStore[key] = queue.add(
    async () => {
      const t1 = Date.now()
      const response: Buffer = await new Promise((resolve, reject) => {
        ;(async () => {
          const ret: Buffer[] = []
          let remoteCrc: string
          const dataProvider = await waitForDataProvider(ptpNode)
          const session = dataProvider.session
          const req = session.request({ ':path': '/', 'prb-key': key })
          req.on('response', (headers, flags) => {
            remoteCrc = headers['prb-crc'] as string
          })
          req.on('data', (chunk) => ret.push(chunk))
          req.on('end', () => {
            const buf = Buffer.concat(ret)
            if (!buf.length) {
              resolve(null)
              return
            }
            const localCrc = crc32(buf).toString(16)

            if (localCrc === remoteCrc) {
              resolve(buf)
            } else {
              reject(new Error('CRC mismatch!'))
            }
          })
          req.end()
        })().catch((e) => reject(e))
      })
      const t2 = Date.now()

      logger.debug(
        { key, responseSize: response?.length, timing: t2 - t1 },
        'getBuffer'
      )

      return response?.length ? response : null
    },
    { priority }
  )

  const ret = await promiseStore[key]
  delete promiseStore[key]
  return ret
}

const _getCachedBuffer = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  key: string,
  priority: number
) => {
  const ret = await getBuffer(ptpNode, key, priority)

  if (ret) {
    cache.set(key, ret)
  }
  return ret
}

const getCachedBuffer = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  key: string,
  priority: number
) => {
  const cached = cache.get(key)

  if (typeof cached !== 'undefined') {
    return cached as Uint8Array
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
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
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
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  number: number,
  cached: boolean,
  priority: number
) =>
  waitFor(async () => {
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
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
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
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  blockNumber: number,
  currentCommittedNumber: number
) => {
  const meta = await waitForRangeByParentNumber(
    ptpNode,
    blockNumber,
    blockNumber < currentCommittedNumber,
    PRIORITY_META
  )
  const ret: Uint8ArrayListWithMeta = []
  if (blockNumber === meta.parentStartBlock) {
    ret.push(
      await getCachedBuffer(
        ptpNode,
        meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey,
        PRIORITY_HEADER_BLOB
      )
    )
  } else {
    ret.push(
      await getCachedBuffer(
        ptpNode,
        meta.drySyncHeaderReqKey,
        PRIORITY_HEADER_BLOB
      )
    )
  }
  ret.meta = meta
  return ret
}

export const getParaBlockBlob = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>,
  blockNumber: number,
  headerSynchedTo: number,
  currentCommittedNumber: number
) => {
  const meta = await waitForParaBlockRange(
    ptpNode,
    blockNumber,
    blockNumber < currentCommittedNumber &&
      headerSynchedTo < currentCommittedNumber
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

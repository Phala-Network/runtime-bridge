import { DATA_PROVIDER, getMyId } from '../utils/my-id'
import {
  bridgeIdentity,
  walkieBootNodes,
  walkieDisableMdnsDiscovery,
  walkieListenAddresses,
} from '../utils/env'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { getDb } from './io/db'
import PQueue from 'p-queue'
import concat from 'it-concat'
import logger from '../utils/logger'
import pipe from 'it-pipe'
import type { PrbLevelDownClient } from './io/db'
import type { WalkieRpcHandler } from '@phala/runtime-bridge-walkie/src/rpc'
import type BufferList from 'bl'

export type _BufferList = BufferList & {
  _bufs?: Buffer[]
}

export const concatBuffer = (s: AsyncIterable<BufferList>) =>
  concat(s, { type: 'buffer' })

export const intoChunks = (buffer: Buffer | Uint8Array, chunkSize: number) => {
  const result = []
  const len = buffer.length

  if (len <= chunkSize) {
    return [buffer]
  }

  let i = 0
  while (i < len) {
    result.push(buffer.slice(i, (i += chunkSize)))
  }
  return result
}

export const setupInternalPtp = async (
  chainIdentity: string,
  info: prb.data_provider.IInfo
) => {
  setLogger(logger)

  const myId = await getMyId(DATA_PROVIDER)
  const ptpNode = await createPtpNode({
    peerId: myId,
    role: prb.WalkieRoles.WR_DATA_PROVIDER_INT,
    chainIdentity,
    bridgeIdentity,
    listenAddresses: walkieListenAddresses,
    bootstrapAddresses: walkieBootNodes,
    disableMdnsDiscovery: walkieDisableMdnsDiscovery,
  })

  const db = await getDb()

  ptpNode.on('GetDataProviderInfo', make_onGetDataProviderInfo(info))
  ptpNode.on('GetBlobByKey', make_onGetBlobByKey(db))

  const readQueue = new PQueue({ concurrency: 10 })

  ptpNode.node.handle('/blob', ({ stream }) => {
    pipe(
      stream.source,
      async (source) => {
        try {
          let bl: BufferList
          for await (const buf of source) {
            if (bl) {
              bl.append(buf as BufferList)
            } else {
              bl = buf as BufferList
            }
          }
          const key = Buffer.concat((bl as _BufferList)._bufs).toString('utf-8')
          if (!key) {
            return ['']
          }
          const data = await readQueue.add(() => db.getBuffer(key))
          return data?.length ? [data] : ['']
        } catch (e) {
          logger.error('handling /blob', e)
          return ['']
        }
      },
      stream.sink
    )
  })

  await ptpNode.start()
  ptpNode.node.multiaddrs.forEach((ma) => {
    logger.debug('Listening on', `${ma.toString()}/p2p/${myId.toB58String()}`)
  })
}

const make_onGetDataProviderInfo =
  (info: prb.data_provider.IInfo): WalkieRpcHandler<'GetDataProviderInfo'> =>
  () =>
    prb.data_provider.Info.create(info)

const make_onGetBlobByKey =
  (db: PrbLevelDownClient): WalkieRpcHandler<'GetBlobByKey'> =>
  async ({ key }) => {
    const data = await db.getBuffer(key)
    return prb.data_provider.RawBlob.create({
      key,
      empty: !data,
      data,
    })
  }

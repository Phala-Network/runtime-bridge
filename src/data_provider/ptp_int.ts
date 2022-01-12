import { DATA_PROVIDER, getMyId } from '../utils/my-id'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { getDb } from './io/db'
import { walkieBootNodes, walkieListenAddresses } from '../utils/env'
import concat from 'it-concat'
import logger from '../utils/logger'
import pipe from 'it-pipe'
import type { PrbLevelDownClient } from './io/db'
import type { WalkieRpcHandler } from '@phala/runtime-bridge-walkie/src/rpc'
import type BufferList from 'bl'

const CHUNK_SIZE = 1048576 * 10

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
    bridgeIdentity: 'default',
    listenAddresses: walkieListenAddresses,
    bootstrapAddresses: walkieBootNodes,
  })

  const db = await getDb()

  ptpNode.on('GetDataProviderInfo', make_onGetDataProviderInfo(info))
  ptpNode.on('GetBlobByKey', make_onGetBlobByKey(db))

  ptpNode.node.handle('/blob', ({ stream }) => {
    pipe(
      stream.source,
      concatBuffer,
      async (source) => {
        try {
          const key = Buffer.concat(
            ((await source) as _BufferList)._bufs
          ).toString('utf-8')
          if (!key) {
            return Buffer.from([])
          }
          const data = await db.getBuffer(key)
          return data?.length ? intoChunks(data, CHUNK_SIZE) : Buffer.from([])
        } catch (e) {
          logger.error('handling /blob', e)
          return Buffer.from([])
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

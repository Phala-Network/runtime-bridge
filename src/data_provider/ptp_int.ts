import { DATA_PROVIDER, getMyId } from '../utils/my-id'
import { DB_BLOCK, getDb } from './io/db'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { walkieBootNodes, walkieListenAddresses } from '../utils/env'
import logger from '../utils/logger'
import type { PrbRedisClient } from '../utils/redis'
import type { WalkieRpcHandler } from '@phala/runtime-bridge-walkie/src/rpc'

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

  const db = await getDb(DB_BLOCK)

  ptpNode.on('GetDataProviderInfo', make_onGetDataProviderInfo(info))
  ptpNode.on('GetBlobByKey', make_onGetBlobByKey(db))

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
  (db: PrbRedisClient): WalkieRpcHandler<'GetBlobByKey'> =>
  async ({ key }) => {
    const data = await db.getBuffer(key)
    return prb.data_provider.RawBlob.create({
      key,
      empty: !data,
      data,
    })
  }

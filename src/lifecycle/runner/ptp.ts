import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { phalaApi } from '../../utils/api'
import { walkieBootNodes } from '../../utils/env'
import PeerId from 'peer-id'
import http from 'http'
import logger from '../../utils/logger'
import wait from '../../utils/wait'
import type { WalkiePeer } from '@phala/runtime-bridge-walkie/src/peer'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'

export const keepAliveAgent = new http.Agent({ keepAlive: true })

export const setupPtp = async () => {
  setLogger(logger)

  const ptpNode = await createPtpNode({
    peerId: await PeerId.create(),
    role: prb.WalkieRoles.WR_CLIENT,
    chainIdentity: (await phalaApi.rpc.chain.getBlockHash(1)).toHex(),
    bridgeIdentity: '',
    listenAddresses: [],
    bootstrapAddresses: walkieBootNodes,
  })
  await ptpNode.start()

  return ptpNode
}

export type BlobServerContext = {
  peer: WalkiePeer
  hostname: string
  port: number
}

const dataProviderBlobSessionTable: { [k: string]: BlobServerContext } = {}

export const connectToBlobServer = async (
  peer: WalkiePeer
): Promise<BlobServerContext> => {
  const session = dataProviderBlobSessionTable[peer.peerId.toB58String()]

  try {
    if (session) {
      return session
    } else {
      const info = await peer.dial('GetDataProviderInfo', {})
      const port = info.data.blobServerPort

      if (!port) {
        return null
      }

      const context: BlobServerContext = {
        peer,
        port,
        hostname: peer.multiaddr.nodeAddress().address,
      }

      dataProviderBlobSessionTable[peer.peerId.toB58String()] = context
      return context
    }
  } catch (e) {
    logger.warn(e)
    return null
  }
}

export const selectDataProvider = (ptpNode: WalkiePtpNode<prb.WalkieRoles>) => {
  // TODO: support redundancy
  const candidate = Object.values(
    ptpNode.peerManager.internalDataProviders
  ).filter((p) => p.chainIdentity === ptpNode.chainIdentity)[0]

  if (!candidate) {
    return null
  }

  return connectToBlobServer(candidate)

  //
  // const ret = dataProviderBlobServerTable[candidate.peerId.toB58String()]
  //
  // if (ret?.open) {
  //   return ret
  // }
}

export const waitForDataProvider = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>
): Promise<BlobServerContext> => {
  const ret = await selectDataProvider(ptpNode)
  if (ret) {
    return ret
  } else {
    await wait(1000)
    return await waitForDataProvider(ptpNode)
  }
}

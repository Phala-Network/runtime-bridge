import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { phalaApi } from '../../utils/api'
import { walkieBootNodes } from '../../utils/env'
import PeerId from 'peer-id'
import logger from '../../utils/logger'
import net from 'net'
import wait from '../../utils/wait'
import type { WalkiePeer } from '@phala/runtime-bridge-walkie/src/peer'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'

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
  open: boolean
  socket: net.Socket
}

const dataProviderBlobServerPortTable: { [k: string]: number } = {}

export const connectToBlobServer = async (
  peer: WalkiePeer
): Promise<BlobServerContext> => {
  let port = dataProviderBlobServerPortTable[peer.peerId.toB58String()]

  try {
    if (!port) {
      const info = await peer.dial('GetDataProviderInfo', {})
      port = info.data.blobServerPort
      dataProviderBlobServerPortTable[peer.peerId.toB58String()] = port
    }
  } catch (e) {
    logger.warn(e)
    return null
  }

  if (!port) {
    return null
  }

  const socket = net.createConnection({
    family: peer.multiaddr.nodeAddress().family,
    port,
    host: peer.multiaddr.nodeAddress().address,
  })

  const context: BlobServerContext = {
    peer,
    open: false,
    socket,
  }

  return new Promise((resolve) => {
    socket.on('error', (err) => {
      logger.error(
        `remote blob server connection(${peer.peerId.toB58String()}):`,
        err
      )
    })

    socket.on('close', (err) => {
      logger.debug(
        `remote blob server connection(${peer.peerId.toB58String()}):`,
        err
      )
      context.open = false
    })

    socket.on('connect', () => {
      resolve(context)
    })
  })
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

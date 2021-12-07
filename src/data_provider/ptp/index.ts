import { DATA_PROVIDER, getMyId } from '../../utils/my-id'
import {
  dataProviderBootNodes,
  dataProviderExternalListenAddress,
} from '../../utils/env'
import { NOISE as libp2p__noise } from '@chainsafe/libp2p-noise'
import libp2p, { Libp2pConfig } from 'libp2p'
import libp2p__bootstrap from 'libp2p-bootstrap'
import libp2p__dht from 'libp2p-kad-dht'
import libp2p__mdns from 'libp2p-mdns'
import libp2p__mplex from 'libp2p-mplex'
import libp2p__tcp from 'libp2p-tcp'
import logger from '../../utils/logger'
import type PeerId from 'peer-id'

const createPtpNode = async (peerId: PeerId, protocolPrefix: string) => {
  const node = await libp2p.create({
    addresses: {
      listen: dataProviderExternalListenAddress,
    },
    peerId,
    modules: {
      transport: [libp2p__tcp],
      streamMuxer: [libp2p__mplex],
      connEncryption: [libp2p__noise],
      peerDiscovery: [libp2p__bootstrap, libp2p__mdns],
      dht: libp2p__dht,
    },
    config: {
      protocolPrefix: '/' + protocolPrefix,
      dht: {
        enabled: true,
      },
      peerDiscovery: {
        autoDial: true,
        bootstrap: {
          interval: 60e3,
          enabled: true,
          list: dataProviderBootNodes,
        },
        mdns: {
          interval: 20e3,
          enabled: true,
        },
        dht: {
          enabled: true,
        },
      },
    } as Libp2pConfig,
  })
  node.connectionManager.on('peer:connect', (connection) => {
    logger.info(
      'Connection established to:',
      connection.remotePeer.toB58String()
    )
  })

  node.on('peer:discovery', (peerId) => {
    logger.info('Discovered:', peerId.toB58String())
  })
  return node
}

export const setupPtp = async (protocolPrefix: string) => {
  const myId = await getMyId(DATA_PROVIDER)
  const ptpNode = await createPtpNode(myId, protocolPrefix)
  await ptpNode.start()
  ptpNode.multiaddrs.forEach((ma) => {
    logger.info('Listening on', `${ma.toString()}/p2p/${myId.toB58String()}`)
  })
}
export default setupPtp

import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { walkieBootNodes } from '../../utils/env'
import PeerId from 'peer-id'
import logger from '../../utils/logger'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'

export const setupPtp = async () => {
  setLogger(logger)

  const ptpNode = await createPtpNode({
    peerId: await PeerId.create(),
    role: prb.WalkieRoles.WR_CLIENT,
    chainIdentity: '',
    bridgeIdentity: '',
    listenAddresses: ['/ip4/0.0.0.0/tcp/0', '/ip6/::/tcp/0'],
    bootstrapAddresses: walkieBootNodes,
  })

  await ptpNode.start()

  return ptpNode
}

export const selectDataProvider = (
  ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_CLIENT>
) => {
  // TODO: support redundancy
  const candidates = Object.values(ptpNode.peerManager.internalDataProviders)
  return candidates[0] || null
}

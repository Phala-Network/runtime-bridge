import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { phalaApi } from '../../utils/api'
import { walkieBootNodes } from '../../utils/env'
import PeerId from 'peer-id'
import logger from '../../utils/logger'
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

export const selectDataProvider = (ptpNode: WalkiePtpNode<prb.WalkieRoles>) => {
  // TODO: support redundancy
  const candidates = Object.values(
    ptpNode.peerManager.internalDataProviders
  ).filter((p) => p.chainIdentity === ptpNode.chainIdentity)
  return candidates[0] || null
}

export const waitForDataProvider = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles>
): Promise<WalkiePeer> => {
  const ret = selectDataProvider(ptpNode)
  if (ret) {
    return ret
  } else {
    await wait(1000)
    return waitForDataProvider(ptpNode)
  }
}

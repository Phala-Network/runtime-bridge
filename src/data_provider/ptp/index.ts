import { DATA_PROVIDER, getMyId } from '../../utils/my-id'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import {
  dataProviderBootNodes,
  dataProviderExternalListenAddress,
} from '../../utils/env'

import logger from '../../utils/logger'

export const setupPtp = async (chainIdentity: string) => {
  setLogger(logger)

  const myId = await getMyId(DATA_PROVIDER)
  const ptpNode = await createPtpNode({
    peerId: myId,
    role: prb.WalkieRoles.WR_DATA_PROVIDER_INT,
    chainIdentity,
    bridgeIdentity: 'default',
    listenAddresses: dataProviderExternalListenAddress,
    bootstrapAddresses: dataProviderBootNodes,
  })

  await ptpNode.start()
  ptpNode.node.multiaddrs.forEach((ma) => {
    logger.debug('Listening on', `${ma.toString()}/p2p/${myId.toB58String()}`)
  })
}
export default setupPtp

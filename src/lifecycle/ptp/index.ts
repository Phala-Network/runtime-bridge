import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { walkieBootNodes, walkieListenAddresses } from '../../utils/env'
import logger from '../../utils/logger'
import type { LifecycleManagerContext } from '../index'
import type { RpcMethodName } from '@phala/runtime-bridge-walkie/dist/rpc-types'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'
import type { WalkieRpcHandler } from '@phala/runtime-bridge-walkie/src/rpc'

const MODULE_LIST = ['./db', './lifecycle'] as const

export type MakeLifecycleManagerPtpHandler<T extends RpcMethodName> = (
  context?: LifecycleManagerContext
) => WalkieRpcHandler<T>

export const setupPtp = async (context: LifecycleManagerContext) => {
  setLogger(logger)

  const ptpNode = await createPtpNode({
    peerId: context.myId,
    role: prb.WalkieRoles.WR_LIFECYCLE_MANAGER,
    chainIdentity: context.chainIdentity,
    bridgeIdentity: 'default',
    listenAddresses: walkieListenAddresses,
    bootstrapAddresses: walkieBootNodes,
  })

  await setupHandlers(ptpNode, context)

  await ptpNode.start()
  ptpNode.node.multiaddrs.forEach((ma) => {
    logger.debug(
      'Listening on',
      `${ma.toString()}/p2p/${context.myId.toB58String()}`
    )
  })

  return ptpNode
}

export type HandlerPair<T extends RpcMethodName> = [
  T,
  MakeLifecycleManagerPtpHandler<T>
]

const setupHandlers = async (
  ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_LIFECYCLE_MANAGER>,
  context: LifecycleManagerContext
) =>
  (await Promise.all(MODULE_LIST.map((n) => import(n))))
    .reduce((prev, curr) => {
      Object.keys(curr).forEach((ii) => {
        prev.push([ii.replace(/^make/, ''), curr[ii]])
      })
      return prev
    }, [])
    .forEach((i: HandlerPair<RpcMethodName>) => ptpNode.on(i[0], i[1](context)))

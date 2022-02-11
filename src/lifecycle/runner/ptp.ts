import {
  bridgeIdentity,
  ptpIgnoreBridgeIdentity,
  walkieBootNodes,
} from '../../utils/env'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { phalaApi } from '../../utils/api'
import { throttle } from 'lodash'
import PeerId from 'peer-id'
import http from 'http'
import logger from '../../utils/logger'
import wait from '../../utils/wait'
import type { WalkiePeer } from '@phala/runtime-bridge-walkie/src/peer'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'

const TIMEOUT_DP_RESCAN = 12000
const TIMEOUT_DP_WAIT = 3000

export const keepAliveAgent = new http.Agent({ keepAlive: true })

export type LifecycleRunnerPtpNode =
  WalkiePtpNode<prb.WalkieRoles.WR_CLIENT> & {
    dpManager: LifecycleRunnerDataProviderManager
  }

export const setupPtp = async (): Promise<LifecycleRunnerPtpNode> => {
  setLogger(logger)

  const ptpNode = await createPtpNode({
    peerId: await PeerId.create(),
    role: prb.WalkieRoles.WR_CLIENT,
    chainIdentity: (await phalaApi.rpc.chain.getBlockHash(1)).toHex(),
    bridgeIdentity,
    listenAddresses: [],
    bootstrapAddresses: walkieBootNodes,
  })
  await ptpNode.start()

  return Object.assign(ptpNode, {
    dpManager: createDataProviderManager(ptpNode),
  })
}

export type BlobServerContext = {
  peer: WalkiePeer
  hostname: string
  port: number
}

export type DataProviderContextTable = { [k: string]: BlobServerContext }

class LifecycleRunnerDataProviderManager {
  #candidates: DataProviderContextTable = {}
  #refreshNeeded = false

  makeCandidateUpdateIterator(
    ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_CLIENT>
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const _this = this
    return async function* CandidateUpdateIterator(): AsyncGenerator {
      while (true) {
        yield* _this.CandidateUpdateIterator(
          Object.values(ptpNode.peerManager.internalDataProviders).filter(
            (p) =>
              p.chainIdentity === ptpNode.chainIdentity &&
              (ptpIgnoreBridgeIdentity
                ? true
                : p.bridgeIdentity === ptpNode.bridgeIdentity)
          )
        )
      }
    }
  }

  async *CandidateUpdateIterator(peers: WalkiePeer[]) {
    const pendingCandidates: DataProviderContextTable = {}
    for (const peer of peers) {
      try {
        const info = await peer.dial('GetDataProviderInfo', {})
        const port = info.data.blobServerPort

        if (port) {
          const ret = {
            peer,
            port,
            hostname: peer.multiaddr.nodeAddress().address,
          }
          pendingCandidates[peer.peerId.toB58String()] = ret
          yield ret
        }
      } catch (e) {
        logger.warn(e)
      }
    }
    if (this.#refreshNeeded) {
      this.#refreshNeeded = false
    } else {
      if (!Object.values(pendingCandidates).length) {
        logger.warn('No data provider available, waiting...')
      }
      this.#candidates = pendingCandidates
      await wait(TIMEOUT_DP_RESCAN)
    }
  }

  getFirstCandidate() {
    const ids = Object.keys(this.candidates || {})
    if (!ids.length) {
      return null
    }
    return this.candidates[ids[0]] || null
  }
  getRandomCandidate() {
    const ids = Object.keys(this.candidates || {})
    if (!ids.length) {
      return null
    }
    if (ids.length === 1) {
      return this.candidates[ids[0]] || null
    }
    return this.candidates[ids[Math.floor(Math.random() * ids.length)]] || null
  }

  async _refreshCandidates(ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_CLIENT>) {
    for await (const context of this.CandidateUpdateIterator(
      Object.values(ptpNode.peerManager.internalDataProviders).filter(
        (p) => p.chainIdentity === ptpNode.chainIdentity
      )
    )) {
      logger.debug(context, 'Updated dp blob server.')
    }
    return this.#candidates
  }

  readonly refreshCandidates = throttle(
    this._refreshCandidates,
    TIMEOUT_DP_WAIT
  )

  get candidates() {
    return this.#candidates
  }
}

const createDataProviderManager = (
  ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_CLIENT>
): LifecycleRunnerDataProviderManager => {
  const dpManager = new LifecycleRunnerDataProviderManager()

  ;(async () => {
    for await (const context of dpManager.makeCandidateUpdateIterator(
      ptpNode
    )()) {
      logger.debug(context, 'Updated dp blob server.')
    }
  })().catch((e) => {
    logger.error(e)
  })

  return dpManager
}

export const selectDataProvider = (ptpNode: LifecycleRunnerPtpNode) =>
  ptpNode.dpManager.getRandomCandidate()

export const waitForDataProvider = async (
  ptpNode: LifecycleRunnerPtpNode
): Promise<BlobServerContext> => {
  const ret = selectDataProvider(ptpNode)
  if (ret) {
    return ret
  } else {
    await wait(TIMEOUT_DP_WAIT)
    return await waitForDataProvider(ptpNode)
  }
}

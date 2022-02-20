import {
  bridgeIdentity,
  ptpIgnoreBridgeIdentity,
  walkieBootNodes,
} from '../../utils/env'
import { crc32cBuffer } from '../../utils/crc'
import { createPtpNode, prb, setLogger } from '@phala/runtime-bridge-walkie'
import { phalaApi } from '../../utils/api'
import { pipeline } from 'stream'
import { throttle } from 'lodash'
import PQueue from 'p-queue'
import PeerId from 'peer-id'
import duplexify from 'duplexify'
import eos from 'end-of-stream'
import http from 'http'
import logger from '../../utils/logger'
import lpstream from 'length-prefixed-stream'
import net from 'net'
import wait from '../../utils/wait'
import * as crypto from 'crypto'
import type { WalkiePeer } from '@phala/runtime-bridge-walkie/src/peer'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'

const TIMEOUT_DP_RESCAN = 12000
const TIMEOUT_DP_WAIT = 3000
const TIMEOUT_DP_GET = 30000

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
  idStr: string
  hostname: string
  port: number
}

export type DataProviderContextTable = { [k: string]: BlobServerContext }

export type LifecycleRunnerDataProviderConnectionResponse = {
  resolve: (buffer: Buffer) => void
  reject: (err: Error) => void
  key: string
  id: string
}
export type LifecycleRunnerDataProviderConnectionResponseMap = Map<
  string,
  LifecycleRunnerDataProviderConnectionResponse
>

class LifecycleRunnerDataProviderConnection {
  closed: boolean
  encoder
  decoder
  stream
  responseMap: LifecycleRunnerDataProviderConnectionResponseMap
  connectPromise: Promise<void>
  connectPromiseReject: (e: Error) => void
  socket: net.Socket
  dataProvider: BlobServerContext
  getQueue
  writeQueue

  constructor(dataProvider: BlobServerContext) {
    this.closed = false
    this.encoder = lpstream.encode()
    this.decoder = lpstream.decode()
    this.stream = duplexify()
    this.responseMap = new Map()
    this.dataProvider = dataProvider
    this.stream.setWritable(this.decoder)
    this.stream.setReadable(this.encoder)
    eos(this.stream, () => this.cleanup.bind(this))
    this.getQueue = new PQueue({ concurrency: 10 })
    this.writeQueue = new PQueue({ concurrency: 1 })
    this.connectPromise = this.connect()
  }

  get(key: string): Promise<Buffer> {
    const _this = this
    const id = crypto.randomBytes(8)
    const idStr = id.toString('hex')
    const write = this._write.bind(this)
    return new Promise((resolve, reject) => {
      const responseCtx: LifecycleRunnerDataProviderConnectionResponse = {
        resolve,
        reject,
        key,
        id: idStr,
      }

      _this.responseMap.set(idStr, responseCtx)
      write(Buffer.concat([id, Buffer.from(key, 'utf-8')])).catch(
        (e: Error) => {
          reject(e)
        }
      )
      setTimeout(() => {
        reject(new Error(`Timeout when getting key '${key}'.`))
        _this.responseMap.delete(idStr)
      }, TIMEOUT_DP_GET)
    })
  }

  _write(data: Buffer): Promise<void> {
    const encoder = this.encoder
    return this.writeQueue.add(
      () =>
        new Promise((resolve) => {
          encoder.write(data, (e) => {
            if (!e) {
              resolve()
            } else {
              logger.warn('Error when writing to stream.', e)
              resolve()
            }
          })
        })
    )
  }

  connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise
    }

    const _this = this
    const dataProvider = this.dataProvider
    const ctxMap = this.responseMap

    const socket = net.createConnection({
      port: dataProvider.port,
      host: dataProvider.hostname,
    })
    this.socket = socket

    this.decoder.on('data', (data) => {
      if (data.length < 8) {
        logger.info('Received invalid data from data provider.')
        return
      }
      const idStr = data.slice(0, 8).toString('hex')
      const responseCtx = ctxMap.get(idStr)
      if (!responseCtx) {
        logger.warn('Got unknown id from dp.')
        return
      }

      if (data.length < 17) {
        responseCtx.resolve(null)
        ctxMap.delete(idStr)
        return
      }
      const remoteCrc = data.slice(8, 16)
      const buf = data.slice(16)
      const localCrc = crc32cBuffer(buf)
      if (remoteCrc.compare(localCrc) !== 0) {
        responseCtx.reject(new Error('CRC Mismatch!'))
        ctxMap.delete(idStr)
        return
      }
      responseCtx.resolve(buf)
      ctxMap.delete(idStr)
    })

    pipeline(socket, this.stream, socket, (err) => {
      logger.warn('db ipc:', err)
    })
    return new Promise((resolve, reject) => {
      _this.connectPromiseReject = reject
      socket.on('error', (err) => {
        logger.error('dp connection:', err)
        reject(err)
        _this.cleanup()
      })

      socket.on('close', (err) => {
        logger.error('dp connection:', err)
        _this.cleanup()
      })

      socket.on('connect', () => {
        logger.info(dataProvider, `Connected to data provider.`)
        resolve()
      })
    })
  }

  waitForConnection() {
    if (!this.connectPromise) {
      throw new Error('Connection not initialized')
    }
    return this.connectPromise
  }

  cleanup() {
    if (this.closed) {
      return
    }
    this.closed = true
    const err = new Error('Connection closed.')
    this.connectPromiseReject?.(err)
    for (const r of this.responseMap.values()) {
      r.reject(err)
    }
    this.responseMap.clear()
  }
}

export type DataProviderConnectionTable = {
  [k: string]: LifecycleRunnerDataProviderConnection
}

class LifecycleRunnerDataProviderManager {
  #candidates: DataProviderContextTable = {}
  #connections: DataProviderConnectionTable = {}
  #locks: Map<string, boolean> = new Map()
  #refreshNeeded = false

  async getConnection(
    ctx: BlobServerContext
  ): Promise<LifecycleRunnerDataProviderConnection> {
    if (this.#locks.get(ctx.idStr)) {
      await wait(100)
      return this.getConnection(ctx)
    }
    try {
      this.#locks.set(ctx.idStr, true)
      const ret = await this._getConnection(ctx)
      this.#locks.set(ctx.idStr, false)
      return ret
    } catch (e) {
      this.#locks.set(ctx.idStr, false)
      throw e
    }
  }

  async _getConnection(
    ctx: BlobServerContext
  ): Promise<LifecycleRunnerDataProviderConnection> {
    const conn = this.#connections[ctx.idStr]
    if (conn && !conn?.closed) {
      return conn
    }
    const newConn = new LifecycleRunnerDataProviderConnection(ctx)
    this.#connections[ctx.idStr] = newConn
    await newConn.waitForConnection()
    return newConn
  }

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
            idStr: peer.peerId.toB58String(),
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

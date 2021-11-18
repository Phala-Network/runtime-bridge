import { EVENTS } from './state_machine'
import { createRpcClient } from '../utils/prpc'
import { getHeaderBlob, getParaBlockBlob } from '../io/blob'
import { minBenchScore } from '../utils/env'
import { phalaApi } from '../utils/api'
import { requestQueue__blob, runtimeRequest } from '../utils/prpc/request'
import logger from '../utils/logger'
import wait from '../utils/wait'

const wrapRequest = (endpoint) => async (resource, body) => {
  const url = `${endpoint}${resource}`
  logger.debug({ url }, 'Sending HTTP request...')
  const res = await runtimeRequest(
    url,
    {
      body,
      responseType: 'json',
    },
    requestQueue__blob
  )

  const data = res.body
  const payload = JSON.parse(data.payload)

  if (data.status === 'ok') {
    logger.debug({ url }, 'Receiving...')
    return {
      ...data,
      payload,
    }
  }

  logger.warn({ url, data }, 'Receiving with error...')
  throw {
    ...data,
    payload,
    isRuntimeReturnedError: true,
  }
}

const wrapUpdateInfo = (runtime) => async () => {
  const { runtimeInfo, rpcClient } = runtime
  const res = await rpcClient.getInfo({})
  Object.assign(
    runtimeInfo,
    res.constructor.toObject(res, {
      defaults: true,
      enums: String,
      longs: Number,
    })
  )
  // TODO: broadcast runtime info update
  return runtimeInfo
}

export const setupRuntime = (workerContext) => {
  if (workerContext.runtime) {
    return workerContext.runtime
  }

  const { snapshot, appContext } = workerContext

  const runtimeInfo = {}
  const initInfo = {}

  const rpcClient = createRpcClient(snapshot.endpoint)
  const request = wrapRequest(snapshot.endpoint)

  const runtime = {
    appContext,
    workerContext,
    runtimeInfo,
    info: runtimeInfo,
    initInfo,
    request,
    rpcClient,
    stopSync: null,
    shouldStopUpdateInfo: false,
  }

  runtime.updateInfo = wrapUpdateInfo(runtime)

  workerContext.runtime = runtime
  return runtime
}

const triggerRa = async (runtime) => {
  const { initInfo, rpcClient, workerContext } = runtime
  workerContext.message = 'Getting RA report...'
  let res = await rpcClient.getRuntimeInfo({})
  res = res.constructor.toObject(res, {
    defaults: true,
    enums: String,
    longs: Number,
  })
  Object.assign(initInfo, res)
  return initInfo
}

export const initRuntime = async (
  runtime,
  debugSetKey = undefined,
  skipRa = false
) => {
  const { initInfo, rpcClient, appContext, workerContext } = runtime
  const { workerBrief, pool } = workerContext
  const runtimeInfo = await runtime.updateInfo()
  runtime.skipRa = skipRa

  if (!(runtimeInfo.initialized && runtimeInfo.registered)) {
    if (runtimeInfo.initialized) {
      let res = await rpcClient.getRuntimeInfo({})
      res = res.constructor.toObject(res, {
        defaults: true,
        enums: String,
        longs: Number,
      })
      Object.assign(initInfo, res)
      workerContext.message = 'Runtime already initialized.'
      logger.debug(workerBrief, 'Already initialized.', res)
    } else {
      const { genesisState, bridgeGenesisInfo } = appContext.genesis
      const initRequestPayload = {
        skipRa: false,
        encodedGenesisState: genesisState,
        encodedGenesisInfo: bridgeGenesisInfo,
        encodedOperator: Buffer.from(
          pool.isProxy
            ? phalaApi.createType('AccountId', pool.realPhalaSs58).toU8a()
            : pool.pair.addressRaw
        ),
        isParachain: true,
      }
      if (skipRa) {
        initRequestPayload.skipRa = true
        initRequestPayload.debugSetKey = Buffer.from(debugSetKey, 'hex')
        logger.info({ skipRa, debugSetKey }, 'Init runtime in debug mode.')
      }
      let res = await rpcClient.initRuntime(initRequestPayload)
      res = res.constructor.toObject(res, {
        defaults: true,
        enums: String,
        longs: Number,
      })

      Object.assign(initInfo, res)
      workerContext.message = 'Runtime initialized.'
      logger.debug(workerBrief, `Initialized pRuntime.`)
    }
  }

  await runtime.updateInfo()

  const updateInfoLoop = async () => {
    await runtime.updateInfo()
    if (runtime.shouldStopUpdateInfo) {
      return
    }
    await wait(3000)
    return updateInfoLoop()
  }
  updateInfoLoop().catch((e) => {
    logger.error(workerBrief, `Failed to update runtime information!`, e)
    workerContext.message = 'Failed to update runtime information!'
    workerContext.stateMachine.handle(EVENTS.ERROR, e)
  })
  return initInfo
}

export const registerWorker = async (runtime) => {
  const { initInfo, info, workerContext } = runtime
  const { pid, dispatchTx, pool } = workerContext

  const publicKey = '0x' + info.publicKey

  const currentPool = await phalaApi.query.phalaStakePool.workerAssignments(
    publicKey
  )

  if (currentPool.isSome && currentPool.toString() !== pid) {
    throw new Error('Worker is assigned to other pool!')
  }

  let shouldRegister = !info.registered

  const workerInfo = (
    await phalaApi.query.phalaRegistry.workers(publicKey)
  ).unwrapOrDefault()

  shouldRegister =
    shouldRegister ||
    !(workerInfo.initialScore.toJSON() > minBenchScore) ||
    !(
      workerInfo.operator.toString() ===
      (pool.isProxy ? pool.realPhalaSs58 : pool.ss58Phala)
    )

  if (shouldRegister) {
    await triggerRa(runtime)
    workerContext.message = 'Registering worker on chain...'
    await dispatchTx({
      action: 'REGISTER_WORKER',
      payload: {
        pid,
        runtimeInfo: '0x' + initInfo.encodedRuntimeInfo.toString('hex'),
        attestation: phalaApi
          .createType('Attestation', {
            SgxIas: {
              raReport:
                '0x' +
                Buffer.from(
                  initInfo.attestation.payload.report,
                  'utf8'
                ).toString('hex'),
              signature:
                '0x' + initInfo.attestation.payload.signature.toString('hex'),
              rawSigningCert:
                '0x' + initInfo.attestation.payload.signingCert.toString('hex'),
            },
          })
          .toHex(),
      },
    })
  }
  if (!currentPool.isSome) {
    const waitUntilWorkerHasInitialScore = async () => {
      const onChainWorkerInfo = (
        await phalaApi.query.phalaRegistry.workers(publicKey)
      ).unwrapOrDefault()
      if (onChainWorkerInfo.initialScore.toJSON() > 0) {
        return
      }
      await wait(24000)
      return await waitUntilWorkerHasInitialScore() // using `return await` for node 14's bad behavior
    }
    workerContext.message = 'Waiting for benchmark...'
    logger.info({ publicKey }, 'Waiting for benchmark...')
    await waitUntilWorkerHasInitialScore()
    workerContext.message = 'Adding worker on chain...'
    logger.info({ publicKey }, 'Adding worker on chain...')

    await dispatchTx({
      action: 'ADD_WORKER',
      payload: {
        pid,
        publicKey,
      },
    })
  }
}

export const startSyncBlob = (runtime) => {
  const {
    workerContext: {
      workerBrief,
      appContext: { fetchStatus },
    },
    info,
    request,
  } = runtime
  let shouldStop = false

  const syncStatus = {
    parentHeaderSynchedTo: -1,
    paraHeaderSynchedTo: -1,
    paraBlockDispatchedTo: -1,
  }
  runtime.syncStatus = syncStatus

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  // headernum => nextParentHeaderNumber
  // paraHeadernum => nextParaHeaderNumber
  // blocknum => nextParaBlockNumber

  const headerSync = async (_next) => {
    if (shouldStop) {
      return
    }
    // TODO: use protobuf api
    const next = typeof _next === 'number' ? _next : info.headernum
    const blobs = await getHeaderBlob(next)
    const {
      payload: {
        relaychain_synced_to: parentSynchedTo,
        parachain_synced_to: paraSynchedTo,
      },
    } = await request('/bin_api/sync_combined_headers', blobs[0])
    syncStatus.parentHeaderSynchedTo = parentSynchedTo
    if (paraSynchedTo > syncStatus.paraHeaderSynchedTo) {
      syncStatus.paraHeaderSynchedTo = paraSynchedTo
    }
    await wait(0)
    return headerSync(parentSynchedTo + 1).catch(doReject)
  }

  const paraBlockSync = async (_next) => {
    if (shouldStop) {
      return
    }
    const next = typeof _next === 'number' ? _next : info.blocknum

    const { paraBlobHeight, synched } = fetchStatus
    const { paraHeaderSynchedTo } = syncStatus

    if (paraHeaderSynchedTo >= next) {
      const data = await getParaBlockBlob(next, paraHeaderSynchedTo)
      const {
        payload: { dispatched_to: dispatchedTo },
      } = await request('/bin_api/dispatch_block', data)

      syncStatus.paraBlockDispatchedTo = dispatchedTo

      if (!synchedToTargetPromiseFinished) {
        if (synched && dispatchedTo === paraBlobHeight) {
          synchedToTargetPromiseFinished = true
          synchedToTargetPromiseResolve(dispatchedTo)
        }
      }

      return paraBlockSync(dispatchedTo + 1).catch(doReject)
    }

    await wait(6000)
    return paraBlockSync(next).catch(doReject)
  }

  runtime.stopSync = () => {
    shouldStop = true
    runtime.stopSync = null
    runtime.syncPromise = null
    logger.warn(workerBrief, 'Stopping synching...')
  }

  const doReject = (error) => {
    if (synchedToTargetPromiseFinished) {
      logger.warn('Unexpected rejection.', error)
      return
    }
    runtime.shouldStopUpdateInfo = true
    runtime.stopSync?.()
    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(error)
  }

  runtime.syncPromise = Promise.all([
    headerSync().catch(doReject),
    paraBlockSync().catch(doReject),
  ])

  return () => synchedToTargetPromise
}

export const startSyncMessage = (runtime) => {
  const {
    workerContext: { pid, workerBrief, dispatchTx },
    rpcClient,
  } = runtime

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  let shouldStop = false
  let loopPromise

  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  runtime.stopSyncMessage = () => {
    shouldStop = true
    runtime.stopSyncMessage = null
    runtime.shouldStopUpdateInfo = true

    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(null)
  }

  const startSyncMqEgress = async () => {
    if (shouldStop) {
      synchedToTargetPromiseFinished = true
      synchedToTargetPromiseReject(null)
      return true
    }

    const messages = phalaApi.createType(
      'EgressMessages',
      (await rpcClient.getEgressMessages({})).encodedMessages
    )

    const ret = []
    for (const m of messages) {
      const origin = m[0]
      const onChainSequence = (
        await phalaApi.query.phalaMq.offchainIngress(origin)
      ).unwrapOrDefault()
      const innerMessages = m[1]
      for (const _m of innerMessages) {
        if (_m.sequence.lt(onChainSequence)) {
          logger.debug(
            `${_m.sequence.toJSON()} has been submitted. Skipping...`
          )
        } else {
          ret.push(_m.toHex())
        }
      }
    }

    if (ret.length) {
      await dispatchTx({
        action: 'BATCH_SYNC_MQ_MESSAGE',
        payload: {
          pid,
          messages: ret,
        },
      })
      logger.debug(workerBrief, `Synched worker ${ret.length} message(s).`)
    } else {
      if (!synchedToTargetPromiseFinished) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseResolve()
      }
    }

    return false
  }

  const _startSyncMqEgress = async (_attempt = 0) => {
    const attempt = _attempt + 1
    logger.debug({ loopPromise, attempt, ...workerBrief }, 'Synching mq...')

    try {
      const _shouldStop = await startSyncMqEgress()
      if (_shouldStop) {
        return
      }
      await wait(36000)
      return await _startSyncMqEgress(attempt)
    } catch (e) {
      if (synchedToTargetPromiseFinished) {
        logger.warn(workerBrief, 'Unexpected rejection.', e)
        return await _startSyncMqEgress(attempt)
      } else {
        logger.warn(workerBrief, 'Error occurred when synching mq...', e)
        await wait(12000)
        return await _startSyncMqEgress(attempt)
      }
    }
  }

  loopPromise = _startSyncMqEgress() // avoid GC

  return () => synchedToTargetPromise
}

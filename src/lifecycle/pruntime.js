import { createRpcClient } from '../utils/prpc'
import { getHeaderBlob, getParaBlockBlob } from '../io/blob'
import { phalaApi } from '../utils/api'
import fetch from 'node-fetch'
import logger from '../utils/logger'
import wait from '../utils/wait'

const wrapRequest = (endpoint) => async (resource, payload = {}) => {
  const url = `${endpoint}${resource}`
  $logger.debug({ url }, 'Sending HTTP request...')
  const fetchOptions = {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  }
  const res = await fetch(url, fetchOptions)
  const data = await res.json()

  if (data.status === 'ok') {
    $logger.debug({ url }, 'Receiving...')
    return {
      ...data,
      payload: JSON.parse(data.payload),
    }
  }

  $logger.warn({ url, data }, 'Receiving with error...')
  throw {
    ...data,
    payload: JSON.parse(data.payload),
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
  }

  runtime.updateInfo = wrapUpdateInfo(runtime)

  workerContext.runtime = runtime
  return runtime
}

export const initRuntime = async (
  runtime,
  debugSetKey = undefined,
  skipRa = false
) => {
  const {
    workerContext: { workerBrief, pool },
    initInfo,
    rpcClient,
    appContext,
  } = runtime
  const runtimeInfo = await runtime.updateInfo()
  runtime.skipRa = skipRa

  if (runtimeInfo.initialized) {
    let res = await rpcClient.getRuntimeInfo({})
    res = res.constructor.toObject(res, {
      defaults: true,
      enums: String,
      longs: Number,
    })
    Object.assign(initInfo, res)
    logger.debug(workerBrief, 'Already initialized.', res)
  } else {
    const { genesisState, bridgeGenesisInfo } = appContext.genesis
    const initRequestPayload = {
      skipRa: false,
      encodedGenesisState: genesisState,
      encodedGenesisInfo: bridgeGenesisInfo,
      operator: Buffer.from(pool.pair.addressRaw),
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
    $logger.debug(workerBrief, `Initialized pRuntime.`)
  }

  await runtime.updateInfo()
  runtime.updateInfoInterval = setInterval(runtime.updateInfo, 3000)
  return initInfo
}

export const registerWorker = async (
  pid,
  info,
  initInfo,
  dispatchTx,
  forceRegister = false
) => {
  const publicKey = '0x' + initInfo.encodedPublicKey.toString('hex')

  const currentPool = await phalaApi.query.phalaStakePool.workerAssignments(
    publicKey
  )

  if (currentPool.isSome && currentPool.toString() !== pid) {
    throw new Error('Worker is assigned to other pool!')
  }

  if (forceRegister || !initInfo.registered) {
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
    logger.info({ publicKey }, 'waitUntilWorkerHasInitialScore')
    await waitUntilWorkerHasInitialScore()
    logger.info({ publicKey }, 'waitUntilWorkerHasInitialScore done.')

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

    await wait(2000)
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
    runtime.stopSync()
    clearInterval(runtime.updateInfoInterval)
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
    workerContext: { worker, workerBrief, dispatchTx },
    rpcClient,
  } = runtime

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  let shouldStop = false
  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  const stopSyncMessage = () => {
    shouldStop = true
    runtime.stopSyncMessage = null
    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(null)
  }

  const doReject = (error) => {
    if (synchedToTargetPromiseFinished) {
      logger.warn('Unexpected rejection.', error)
      return
    }
    runtime.stopSyncMessage()
    clearInterval(runtime.updateInfoInterval)
    synchedToTargetPromiseReject(error)
    synchedToTargetPromiseFinished = true
  }

  runtime.stopSyncMessage = stopSyncMessage

  const startSyncMqEgress = async () => {
    if (shouldStop) {
      return
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
          messages: ret,
          worker,
        },
      })
      logger.debug(workerBrief, `Synched worker ${ret.length} message(s).`)
    } else {
      if (!synchedToTargetPromiseFinished) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseResolve()
      }
    }

    await wait(12000)
    return startSyncMqEgress().catch(doReject)
  }

  startSyncMqEgress().catch(doReject)

  return () => synchedToTargetPromise
}

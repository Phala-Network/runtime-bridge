import { base64Decode } from '@polkadot/util-crypto'
import { createRpcClient } from '../utils/prpc'
import { getBlockBlob, getHeaderBlob } from '../io/blob'
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
      genesisState,
      genesisInfo: bridgeGenesisInfo,
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
    parentHeaderSynchedTo: 0,
    paraHeaderSynchedTo: 0,
    paraBlockDispatchedTo: 0,
  }

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  // headernum => nextParentHeaderNumber
  // paraHeadernum => nextParaHeaderNumber
  // blocknum => nextParaBlockNumber

  const parentHeaderSync = async (next) => {
    if (shouldStop) {
      return
    }
    console.log(info)
  }

  const paraHeaderSync = async (next) => {
    if (shouldStop) {
      return
    }
    let { headernum } = info
    if (typeof next === 'number') {
      headernum = next
    }
    const data = await getHeaderBlob(headernum)
    const {
      payload: { synced_to: synchedTo },
    } = await request('/bin_api/sync_header', data)

    headerSynchedTo = synchedTo

    return paraHeaderSync(synchedTo + 1).catch(doReject)
  }
  const paraBlockSync = async (next) => {
    if (shouldStop) {
      return
    }
    let { blocknum } = info
    if (typeof next === 'number') {
      blocknum = next
    }

    const { blobHeight, hasReachedInitTarget } = fetchStatus

    if (headerSynchedTo >= blocknum) {
      const data = await getBlockBlob(blocknum, headerSynchedTo)
      const {
        payload: { dispatched_to: dispatchedTo },
      } = await request('/bin_api/dispatch_block', data)

      if (!synchedToTargetPromiseFinished) {
        if (hasReachedInitTarget && dispatchedTo === blobHeight) {
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
    parentHeaderSync().catch(doReject),
    paraHeaderSync().catch(doReject),
    paraBlockSync().catch(doReject),
  ])

  return () => synchedToTargetPromise
}

const startSyncMqEgress = async (syncContext) => {
  if (syncContext.shouldStop) {
    return
  }
  const {
    worker,
    workerBrief,
    onError,
    dispatchTx,
    runtime: { request },
  } = syncContext

  const messages = phalaApi.createType(
    'Vec<(MessageOrigin, Vec<SignedMessage>)>',
    base64Decode((await request('/get_egress_messages')).payload.messages)
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
        logger.debug(`${_m.sequence.toJSON()} has been submitted. Skipping...`)
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
  }

  await wait(6000)
  return startSyncMqEgress(syncContext).catch(onError)
}

export const startSyncMessage = (runtime) => {
  const {
    workerContext: { worker, workerBrief, dispatchTx },
    plainQuery,
  } = runtime

  const stopSyncMessage = () => {
    syncContext.shouldStop = true
    runtime.stopSyncMessage = null
  }
  const onError = (error) => {
    stopSyncMessage()
    throw error
  }

  const syncContext = {
    runtime,
    shouldStop: false,
    worker,
    workerBrief,
    dispatchTx,
    stopSyncMessage,
    plainQuery,
  }

  runtime.mqSyncContext = syncContext
  runtime.stopSyncMessage = stopSyncMessage

  const enabledMqArr = [startSyncMqEgress]

  return Promise.all(enabledMqArr.map((i) => i(syncContext).catch(onError)))
}

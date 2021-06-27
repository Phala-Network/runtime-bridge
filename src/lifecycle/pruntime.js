// import { base64Decode } from '@polkadot/util-crypto'
import { base64Decode } from '@polkadot/util-crypto'
import { getBlockBlobs, getHeaderBlobs, waitForBlock } from '../io/block'
import { phalaApi } from '../utils/api'
import { shouldSkipRa } from '../utils/env'
import createKeyring from '../utils/keyring'
import fetch from 'node-fetch'
import logger from '../utils/logger'
import wait from '../utils/wait'

const keyring = await createKeyring()

const wrapRequest = (endpoint) => async (resource, payload = {}) => {
  // TODO: retry
  const url = `${endpoint}${resource}`
  const body = {
    input: payload,
    nonce: {
      value: Math.round(Math.random() * 1_000_000_000),
    },
  }
  $logger.debug({ url }, 'Sending HTTP request...')
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  })
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

const wrapPlainQuery = (request) => async (contractId, payload = {}) => {
  const res = await request('/query', {
    query_payload: JSON.stringify({
      Plain: JSON.stringify({
        contract_id: contractId,
        nonce: Math.round(Math.random() * 1_000_000_000),
        request: payload,
      }),
    }),
  })
  return JSON.parse(res.payload.Plain)
}

const wrapUpdateInfo = (runtime) => async () => {
  const { runtimeInfo, request } = runtime
  const req = await request('/get_info')
  Object.assign(runtimeInfo, req.payload)
  // TODO: broadcast runtime info update
  return runtimeInfo
}

export const setupRuntime = (workerContext) => {
  if (workerContext.runtime) {
    return workerContext.runtime
  }

  const { snapshot } = workerContext

  const runtimeInfo = {}
  const initInfo = {}

  const request = wrapRequest(snapshot.runtimeEndpoint)
  const plainQuery = wrapPlainQuery(request)

  const runtime = {
    workerContext,
    runtimeInfo,
    info: runtimeInfo,
    initInfo,
    request,
    plainQuery,
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
    workerContext: { worker, workerBrief, _dispatchTx },
    initInfo,
    request,
  } = runtime
  const runtimeInfo = await runtime.updateInfo()
  runtime.skipRa = skipRa

  if (runtimeInfo.initialized) {
    Object.assign(initInfo, (await request('/get_runtime_info')).payload)
    logger.debug(workerBrief, 'Already initialized.')
  } else {
    const { genesisState, bridgeGenesisInfo } = await waitForBlock(0)
    const initRequestPayload = {
      bridge_genesis_info_b64: bridgeGenesisInfo.toString('base64'),
      genesis_state_b64: genesisState.toString('base64'),
      skip_ra: skipRa,
    }
    if (skipRa) {
      initRequestPayload.debugSetKey = debugSetKey
      logger.info({ skipRa, debugSetKey }, 'Init runtime in debug mode.')
    }

    Object.assign(
      initInfo,
      (await request('/init_runtime', initRequestPayload)).payload
    )
    await runtime.updateInfo()
    $logger.debug(workerBrief, `Initialized pRuntime.`)
  }

  const machineId = runtimeInfo['machine_id']
  const machineOwner = keyring.encodeAddress(
    await phalaApi.query.phala.machineOwner(machineId)
  )
  if (!skipRa) {
    if (machineOwner === worker.phalaSs58Address) {
      logger.debug(workerBrief, 'Worker already registered, skipping.')
    } else {
      await _dispatchTx({
        action: 'REGISTER_WORKER',
        payload: {
          encodedRuntimeInfo: initInfo['encoded_runtime_info'],
          attestation: initInfo.attestation,
          worker,
        },
      })
      logger.debug(workerBrief, 'Registered worker.')
    }
  }

  await runtime.updateInfo()
  runtime.updateInfoInterval = setInterval(runtime.updateInfo, 3000)
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
  let headerSynchedTo = 0

  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })

  const headerSyncLoop = async (next) => {
    if (shouldStop) {
      return
    }
    let { headernum } = info
    if (typeof next === 'number') {
      headernum = next
    }
    const data = await getHeaderBlobs(headernum)
    const {
      payload: { synced_to: synchedTo },
    } = await request('/sync_header', data)

    headerSynchedTo = synchedTo

    return headerSyncLoop(synchedTo + 1).catch(doReject)
  }
  const blockSyncLoop = async (next) => {
    if (shouldStop) {
      return
    }
    let { blocknum } = info
    if (typeof next === 'number') {
      blocknum = next
    }

    const { latestBlock, synched } = fetchStatus

    if (headerSynchedTo >= blocknum) {
      const data = await getBlockBlobs(blocknum)
      const {
        payload: { dispatched_to: dispatchedTo },
      } = await request('/dispatch_block', data)

      if (!synchedToTargetPromiseFinished) {
        if (synched && dispatchedTo === latestBlock) {
          synchedToTargetPromiseFinished = true
          synchedToTargetPromiseResolve(dispatchedTo)
        }
      }

      return blockSyncLoop(dispatchedTo + 1).catch(doReject)
    }

    await wait(2000)
    return blockSyncLoop(next).catch(doReject)
  }

  runtime.stopSync = () => {
    shouldStop = true
    runtime.stopSync = null
    runtime.syncPromise = null
    logger.warn(workerBrief, 'Stopping synching...')
  }

  const doReject = (error) => {
    if (synchedToTargetPromiseFinished) {
      logger.warn('Unexcepted rejection.', error)
      return
    }
    runtime.stopSync()
    clearInterval(runtime.updateInfoInterval)
    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(error)
  }

  runtime.syncPromise = Promise.all([
    headerSyncLoop().catch(doReject),
    blockSyncLoop().catch(doReject),
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
        console.log(`${_m.sequence.toJSON()} has been submitted. Skipping...`)
      } else {
        ret.push(_m.toHex())
      }
    }
  }

  if (ret.length) {
    await dispatchTx({
      action: 'BATCH_SYNC_WORKER_MESSAGE',
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

const startSyncSystemEgress = async (syncContext) => {
  if (syncContext.shouldStop) {
    return
  }
  const {
    worker,
    workerBrief,
    onError,
    dispatchTx,
    runtime: { plainQuery },
  } = syncContext
  const onChainSequence = await phalaApi.query.phala.workerIngress(
    worker.phalaSs58Address
  )
  const {
    GetWorkerEgress: { encoded_egress_b64: encodedEgressB64, length },
  } = await plainQuery(0, {
    GetWorkerEgress: {
      start_sequence: onChainSequence.toNumber(),
    },
  })

  if (!length) {
    logger.debug(workerBrief, 'No worker message to sync.')
    await wait(6000)
    return startSyncSystemEgress(syncContext).catch(onError)
  }
  const messageQueue = phalaApi.createType(
    'Vec<SignedWorkerMessage>',
    base64Decode(encodedEgressB64)
  )

  await dispatchTx({
    action: 'BATCH_SYNC_WORKER_MESSAGE',
    payload: {
      messages: messageQueue
        .map((message) => {
          if (message.data.sequence.lt(onChainSequence)) {
            return undefined
          }

          return message.toHex()
        })
        .filter((i) => i),
      worker,
    },
  })
  logger.debug(workerBrief, 'Synched worker message(s).')

  await wait(6000)
  return startSyncSystemEgress(syncContext).catch(onError)
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

  return Promise.all(
    [startSyncMqEgress, startSyncSystemEgress].map((i) =>
      i(syncContext).catch(onError)
    )
  )
}

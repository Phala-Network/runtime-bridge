// import { base64Decode } from '@polkadot/util-crypto'
import { getBlockBlobs, getHeaderBlobs, waitForBlock } from '../io/block'
import { phalaApi } from '../utils/api'
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

const wrapPlainQuery = (request) => async (contractId, payload = {}) =>
  JSON.parse(
    await request('/query', {
      query_payload: JSON.stringify({
        Plain: JSON.stringify({
          contract_id: contractId,
          nonce: Math.round(Math.randoum() * 1_000_000_000),
          request: payload,
        }),
      }),
    })
  )

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
  skipRa = false,
  debugSetKey = null
) => {
  const {
    workerContext: { worker, workerBrief, _dispatchTx },
    initInfo,
    request,
  } = runtime
  const runtimeInfo = await runtime.updateInfo()
  if (runtimeInfo.initialized) {
    Object.assign(initInfo, (await request('/get_runtime_info')).payload)
    logger.debug(workerBrief, 'Already initialized.')
  } else {
    const { genesisState, bridgeGenesisInfo } = await waitForBlock(0)
    Object.assign(
      initInfo,
      (
        await request('/init_runtime', {
          skip_ra: skipRa,
          debug_set_key: debugSetKey,
          bridge_genesis_info_b64: bridgeGenesisInfo.toString('base64'),
          genesis_state_b64: genesisState.toString('base64'),
        })
      ).payload
    )
    await runtime.updateInfo()
    $logger.debug(workerBrief, `Initialized pRuntime.`)
  }

  const machineId = runtimeInfo['machine_id']
  const machineOwner = keyring.encodeAddress(
    await phalaApi.query.phala.machineOwner(machineId)
  )
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
  await runtime.updateInfo()
  runtime.updateInfoInterval = setInterval(runtime.updateInfo, 3000)
}

export const startSync = (runtime) => {
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

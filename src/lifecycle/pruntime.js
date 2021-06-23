// import { base64Decode } from '@polkadot/util-crypto'
import { phalaApi } from '../utils/api'
import { waitForBlock } from '../io/block'
import createKeyring from '../utils/keyring'
import fetch from 'node-fetch'
import logger from '../utils/logger'

const keyring = await createKeyring()

const wrapRequest = (endpoint) => async (resource, payload = {}) => {
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
}

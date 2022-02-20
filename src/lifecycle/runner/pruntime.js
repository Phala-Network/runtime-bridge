import { EVENTS } from './state_machine'
import { createRpcClient } from '../../utils/prpc'
import { enforceMinBenchScore, minBenchScore, rpcRequestTimeout } from '../env'
import { phalaApi } from '../../utils/api'
import { requestQueue__blob, runtimeRequest } from '../../utils/prpc/request'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

const wrapRequest =
  (endpoint) =>
  async (resource, body, timeout = rpcRequestTimeout) => {
    const url = `${endpoint}${resource}`
    const res = await runtimeRequest(
      {
        url,
        data: body,
        responseType: 'json',
        timeout,
      },
      requestQueue__blob
    )

    const data = res.data
    const payload = JSON.parse(data.payload)

    if (data.status === 'ok') {
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
  const ret = res.constructor.toObject(res, {
    defaults: true,
    enums: String,
    longs: Number,
  })
  Object.assign(runtimeInfo, ret)
  return ret
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
            ? phalaApi.createType('AccountId', pool.proxiedAccountSs58).toU8a()
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
  const { pid, dispatchTx, pool, poolSnapshot } = workerContext

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
      (pool.isProxy ? pool.proxiedAccountSs58 : poolSnapshot.owner.ss58Phala)
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
      if (
        onChainWorkerInfo.initialScore.toJSON() >
        (enforceMinBenchScore ? minBenchScore : 0)
      ) {
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

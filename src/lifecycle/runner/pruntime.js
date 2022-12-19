import { EVENTS } from './state_machine'
import { createRpcClient, wrapRequest } from '../../utils/prpc'
import { enforceMinBenchScore, minBenchScore } from '../env'
import { phalaApi } from '../../utils/api'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

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
  const { pool } = workerContext

  workerContext.message = 'Getting RA report...'
  let res = await rpcClient.getRuntimeInfo({
    forceRefreshRa: true,
    encodedOperator: Buffer.from(
      pool.isProxy
        ? phalaApi.createType('AccountId', pool.proxiedAccountSs58).toU8a()
        : pool.pair.addressRaw
    ),
  })
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

  let updateInfoLoopRetries = 0

  const updateInfoLoop = async () => {
    try {
      await runtime.updateInfo()
      updateInfoLoopRetries = 0
      if (runtime.shouldStopUpdateInfo) {
        return
      }
      await wait(3000)
    } catch (e) {
      updateInfoLoopRetries += 1
      if (updateInfoLoopRetries > 5) {
        throw e
      }
      await wait(8000)
    }
    return updateInfoLoop()
  }
  updateInfoLoop().catch((e) => {
    logger.error(workerBrief, `Failed to update runtime information!`, e)
    workerContext.message = 'Failed to update runtime information!'
    workerContext.stateMachine.handle(EVENTS.ERROR, e)
  })
  return initInfo
}

export const registerWorker = async (runtime, forceRa = false) => {
  const { initInfo, info, workerContext } = runtime
  const { pid, dispatchTx, pool, poolSnapshot } = workerContext

  const publicKey = '0x' + info.publicKey

  const currentPool = await phalaApi.query.phalaStakePoolv2.workerAssignments(
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

  if (forceRa || shouldRegister) {
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

  if (forceRa) {
    return
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

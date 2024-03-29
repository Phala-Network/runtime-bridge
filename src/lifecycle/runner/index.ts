import {
  DB_PB_TO_OBJECT_OPTIONS,
  pbToObject,
} from '../../data_provider/io/db_encoding'
import { EVENTS } from './state_machine'
import { LIFECYCLE, getMyId } from '../../utils/my-id'
import { Op } from 'sequelize'
import {
  createWorkerContext,
  destroyWorkerContext,
  getWorkerStates,
} from './worker'
import { phalaApi, setupParentApi, setupPhalaApi } from '../../utils/api'
import { prb } from '@phala/runtime-bridge-walkie'
import { selectDataProvider, setupPtp, waitForDataProvider } from './ptp'
import { setupIpcWorker } from '../../utils/ipc'
import { setupLocalDb } from '../local_db'
import Pool from '../local_db/pool_model'
import Worker from '../local_db/worker_model'
import createTradeQueue from '../../trade/trade_queue'
import env from '../../utils/env'
import logger from '../../utils/logger'
import wait from '../../utils/wait'
import type { LifecycleHandlerTable } from '../runner_ipc'
import type { LifecycleRunnerPtpNode } from './ptp'
import type { Message } from 'protobufjs'
import type { Sequelize } from 'sequelize'
import type { U8 } from '@polkadot/types'
import type { WorkerContextMap } from './worker'
import type BeeQueue from 'bee-queue'

export type RunnerContext = {
  localDb: Sequelize
  workers: WorkerContextMap
  sendToManager?: ReturnType<typeof setupIpcWorker>['send']
  ptpNode: LifecycleRunnerPtpNode
  fetchStatus?: prb.data_provider.Info
  txQueue: BeeQueue
} & {
  [k: string]: unknown
}

const updateDataProviderInfo = async (context: RunnerContext) => {
  const { ptpNode } = context
  const peer = await selectDataProvider(ptpNode)

  if (!peer) {
    logger.info('Data provider not found, Waiting...')
    return null
  }

  const response = await peer.peer.dial('GetDataProviderInfo', {})
  if (response.hasError) {
    logger.warn('Error while updating data provider info:', response.error)
    return null
  }

  return response.data
}

const startRunner = async () => {
  const runnerId = process.env.PHALA_RUNNER_ID
  if (!runnerId) {
    throw new Error('Runner should be forked with an id!')
  }

  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)

  const myId = await getMyId(LIFECYCLE)
  const localDb = await setupLocalDb(myId)
  const ptpNode = await setupPtp()

  const workers: WorkerContextMap = {}

  const txQueue = createTradeQueue(env.qRedisEndpoint) as BeeQueue & {
    dispatch: (...args: unknown[]) => unknown
  }
  await txQueue.ready()

  const paraId = (
    (await phalaApi.query.parachainInfo.parachainId()) as U8
  ).toNumber()
  const genesisResponse = await (
    await waitForDataProvider(ptpNode)
  ).peer.dial('GetBlobByKey', {
    key: `genesis:${paraId}:pb`,
  })

  if (genesisResponse.hasError) {
    throw genesisResponse.error
  }

  if (genesisResponse.data.empty) {
    throw new Error('Genesis not found from data provider!')
  }

  const context: RunnerContext = {
    workers,
    localDb,
    ptpNode,
    txQueue,
    genesis: pbToObject(
      prb.db.Genesis.decode(
        genesisResponse.data.data
      ) as unknown as Message<prb.db.IGenesis>,
      DB_PB_TO_OBJECT_OPTIONS
    ),
    _dispatchTx: txQueue.dispatch,
  }

  const updateDataProviderInfoLoop = async (): Promise<never> => {
    try {
      const info = await updateDataProviderInfo(context)

      if (info) {
        if (context.fetchStatus) {
          if (
            info.paraProcessedHeight >= context.fetchStatus.paraProcessedHeight
          ) {
            Object.assign(context.fetchStatus, info)
          } else {
            logger.warn('Received outdated dp info!')
          }
        } else {
          context.fetchStatus = info
        }
      }
    } catch (e) {
      logger.warn(e)
    }

    await wait(3000)
    return updateDataProviderInfoLoop()
  }

  updateDataProviderInfoLoop().catch((e) => logger.warn(e))

  const { send: sendToManager } = setupIpcWorker({
    runnerShouldInit: (ids) => {
      logger.info(`Initializing runner ${runnerId} with ${ids.length} workers.`)
      wait(500)
        .then(() => startWorkers(ids, context))
        .then(() => {
          const updateStateLoop = async (): Promise<never> => {
            context.sendToManager(
              'managerShouldUpdateWorkerInfo',
              getWorkerStates(ids, context.workers)
            )
            await wait(500)
            return updateStateLoop()
          }
          wait(500).then(() => updateStateLoop())
        })
        .catch((e) => {
          logger.error(e)
          process.exit(255)
        })
    },
    runnerShouldKickWorker: makeRunnerShouldKickWorker(context),
    runnerShouldRefreshRaAndRestartWorker:
      makeRunnerShouldRefreshRaAndRestartWorker(context),
    runnerShouldRestartWorker: makeRunnerShouldRestartWorker(context),
    runnerShouldUpdateWorker: makeRunnerShouldUpdateWorker(context),
  } as LifecycleHandlerTable)
  context.sendToManager = sendToManager

  sendToManager('managerShouldInitRunner', runnerId)
}

export const startWorkers = async (ids: string[], context: RunnerContext) => {
  const workers = await Worker.findAll({
    include: [Pool],
    where: {
      id: { [Op.in]: ids },
    },
  })

  await Promise.all(
    workers.map(async (w) => {
      context.workers[w.id] = await createWorkerContext(w, context)
    })
  )
}

export const makeRunnerShouldKickWorker =
  (context: RunnerContext): LifecycleHandlerTable['runnerShouldKickWorker'] =>
  (ids) => {
    ids
      .map((i) => context.workers[i])
      .filter((i) => i)
      .map((i) => i.stateMachine.handle(EVENTS.SHOULD_KICK))
  }
export const makeRunnerShouldRestartWorker =
  (
    context: RunnerContext
  ): LifecycleHandlerTable['runnerShouldRestartWorker'] =>
  async (ids) => {
    await Promise.all(
      ids
        .map((i) => context.workers[i])
        .filter((i) => i)
        .map(async (i) => {
          await destroyWorkerContext(i, false)
          context.workers[i._worker.id] = await createWorkerContext(
            i._worker,
            context,
            false
          )
        })
    )
  }
export const makeRunnerShouldRefreshRaAndRestartWorker =
  (
    context: RunnerContext
  ): LifecycleHandlerTable['runnerShouldRefreshRaAndRestartWorker'] =>
  async (ids) => {
    await Promise.all(
      ids
        .map((i) => context.workers[i])
        .filter((i) => i)
        .map(async (i) => {
          await destroyWorkerContext(i, false)
          context.workers[i._worker.id] = await createWorkerContext(
            i._worker,
            context,
            true
          )
        })
    )
  }

export const makeRunnerShouldUpdateWorker =
  (context: RunnerContext): LifecycleHandlerTable['runnerShouldUpdateWorker'] =>
  (ids) => {
    context.sendToManager(
      'managerShouldUpdateWorkerInfo',
      getWorkerStates(ids, context.workers)
    )
  }

export default startRunner

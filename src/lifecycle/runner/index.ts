import { EVENTS } from './state_machine'
import { LIFECYCLE, getMyId } from '../../utils/my-id'
import { Op } from 'sequelize'
import { createWorkerContext, destroyWorkerContext } from './worker'
import { selectDataProvider, setupPtp } from './ptp'
import { setupIpcWorker } from '../../utils/ipc'
import { setupLocalDb } from '../local_db'
import { setupParentApi, setupPhalaApi } from '../../utils/api'
import Pool from '../local_db/pool_model'
import Worker from '../local_db/worker_model'
import createTradeQueue from '../../trade/trade_queue'
import env from '../../utils/env'
import logger from '../../utils/logger'
import wait from '../../utils/wait'
import type { LifecycleHandlerTable } from '../runner_ipc'
import type { Sequelize } from 'sequelize'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'
import type { WorkerContextMap } from './worker'
import type { prb } from '@phala/runtime-bridge-walkie'

export type RunnerContext = {
  localDb: Sequelize
  workers: WorkerContextMap
  sendToManager?: ReturnType<typeof setupIpcWorker>['send']
  ptpNode: WalkiePtpNode<prb.WalkieRoles.WR_CLIENT>
  fetchStatus?: prb.data_provider.Info
}

const updateDataProviderInfo = async (context: RunnerContext) => {
  const { ptpNode } = context
  const peer = selectDataProvider(ptpNode)

  if (!peer) {
    logger.info('Data provider not found, Waiting...')
    return null
  }

  const response = await peer.dial('GetDataProviderInfo', {})
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

  const myId = await getMyId(LIFECYCLE)
  const localDb = await setupLocalDb(myId)

  const workers: WorkerContextMap = {}

  const txQueue = createTradeQueue(env.qRedisEndpoint)
  await txQueue.ready()

  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)
  const ptpNode = await setupPtp()

  const context: RunnerContext = {
    workers,
    localDb,
    ptpNode,
  }

  const updateDataProviderInfoLoop = async (): Promise<never> => {
    const info = await updateDataProviderInfo(context)
    if (info) {
      if (context.fetchStatus) {
        context.fetchStatus = info
      } else {
        Object.assign(context.fetchStatus, info)
      }
    }
    await wait(3000)
    return updateDataProviderInfoLoop()
  }

  updateDataProviderInfoLoop().catch((e) => logger.warn(e))

  const { send: sendToManager } = setupIpcWorker({
    runnerShouldInit: (ids) => {
      logger.info(`Initializing runner ${runnerId} with ${ids.length} workers.`)
      startWorkers(ids, context).catch((e) => {
        logger.error(e)
        process.exit(255)
      })
    },
    runnerShouldKickWorker: makeRunnerShouldKickWorker(context),
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
            context
          )
        })
    )
  }
export const makeRunnerShouldUpdateWorker =
  (context: RunnerContext): LifecycleHandlerTable['runnerShouldUpdateWorker'] =>
  (ids) => {}

export default startRunner

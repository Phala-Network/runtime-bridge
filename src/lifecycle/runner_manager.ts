import { fork } from './runner_ipc'
import { prb } from '@phala/runtime-bridge-walkie'
import { randomUUID } from 'crypto'
import Worker from './local_db/worker_model'
import logger from '../utils/logger'
import type { LifecycleManagerContext } from './index'

export type RunnerMeta = {
  id: string
  workerIds: string[]
  ipcHandle?: ReturnType<typeof fork>
}
export type RunnerMetaMap = { [id: string]: RunnerMeta }

export type WorkerMeta = prb.IWorkerState & {
  id?: string
  runner?: RunnerMeta
}
export type WorkerMetaMap = { [id: string]: WorkerMeta }

export type RunnerManagerContext = {
  lifecycleManagerContext: LifecycleManagerContext
  runners: RunnerMetaMap
  workers: WorkerMetaMap
}

export const createRunnerManager = async (
  lifecycleManagerContext: LifecycleManagerContext
): Promise<RunnerManagerContext> => {
  const runners: RunnerMetaMap = {}
  const workers: WorkerMetaMap = {}

  const context: RunnerManagerContext = {
    lifecycleManagerContext,
    runners,
    workers,
  }

  // const allPools = await Pool.findAll({
  //   where: { enabled: true },
  //   attributes: ['id', 'pid'],
  // })

  // const workerIdGroups = (
  //   await Promise.all(
  //     allPools.map(async (p) => ({
  //       pid: p.pid,
  //       workers: (
  //         await Worker.findAll({
  //           where: {
  //             poolId: p.id,
  //             enabled: true,
  //           },
  //           attributes: ['id'],
  //         })
  //       ).map((i) => i.id),
  //     }))
  //   )
  // ).filter((i) => i.workers.length)

  const workerIdGroups = [
    (
      await Worker.findAll({
        where: {
          enabled: true,
        },
        attributes: ['id'],
      })
    ).map((i) => i.id),
  ].filter((i) => i.length)

  if (!workerIdGroups.length) {
    logger.warn(
      'No valid worker found, please add workers and restart lifecycle manager.'
    )
    return context
  }

  for (const ids of workerIdGroups) {
    logger.info(`Starting runner for ${ids.length} workers.`)
    const runnerId = randomUUID()
    const runnerMeta: RunnerMeta = {
      id: runnerId,
      workerIds: ids,
    }
    const forkRet = fork(
      'runner',
      {
        managerShouldInitRunner: (remoteRunnerId) => {
          if (runnerId !== remoteRunnerId) {
            logger.error({ runnerId, remoteRunnerId }, 'Runner id mismatch!')
            process.exit(200)
          }
          forkRet.send('runnerShouldInit', ids)
        },
        managerShouldUpdateWorkerInfo: (workerInfoMap) => {
          for (const workerId of Object.keys(workerInfoMap)) {
            workers[workerId] = Object.assign(
              workers[workerId] || {
                id: workerId,
                runner: runnerMeta,
              },
              workerInfoMap[workerId],
              {
                status: prb.WorkerState.Status[workerInfoMap[workerId].status],
              }
            )
          }
        },
      },
      {
        PHALA_RUNNER_ID: runnerId,
      }
    )
    runnerMeta.ipcHandle = forkRet
    runners[runnerId] = runnerMeta
  }

  return context
}

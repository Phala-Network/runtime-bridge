import { fork } from './runner_ipc'
import { randomUUID } from 'crypto'
import { runnerMaxWorkerNumber } from './env'
import Worker from './local_db/worker_model'
import logger from '../utils/logger'
import type { LifecycleManagerContext } from './index'
import type { prb } from '@phala/runtime-bridge-walkie'

const intoChunks = (array: unknown[], chunkSize: number) => {
  const result = []
  const len = array.length

  if (len <= chunkSize) {
    return [array]
  }

  let i = 0
  while (i < len) {
    result.push(array.slice(i, (i += chunkSize)))
  }
  return result
}

export type RunnerMeta = {
  id: string
  workerIds: string[]
  ipcHandle: ReturnType<typeof fork>
}
export type RunnerMetaMap = { [id: string]: RunnerMeta }

export type WorkerMeta = prb.IWorkerState & {
  id: string
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

  const allWorkersIds = (
    await Worker.findAll({
      where: { enabled: true },
      attributes: ['id'],
    })
  ).map((i) => i.id)

  if (!allWorkersIds.length) {
    logger.warn(
      'No worker found, please add workers and restart lifecycle manager.'
    )
    return context
  }

  const workerIdGroups = intoChunks(
    allWorkersIds,
    runnerMaxWorkerNumber
  ) as string[][]
  console.log(
    `Starting ${workerIdGroups.length} runners for ${allWorkersIds.length}`
  )

  for (const workerIds of workerIdGroups) {
    const runnerId = randomUUID()
    const { send } = fork(
      'runner',
      {
        managerShouldInitRunner: (remoteRunnerId) => {
          if (runnerId !== remoteRunnerId) {
            logger.error({ runnerId, remoteRunnerId }, 'Runner id mismatch!')
            process.exit(200)
          }
          send('runnerShouldInit', workerIds)
        },
        managerShouldUpdateWorkerInfo: (workerInfoMap) => {
          for (const workerId of Object.keys(workerInfoMap)) {
            workers[workerId] = Object.assign(
              workers[workerId],
              workerInfoMap[workerId]
            )
          }
        },
      },
      {
        PHALA_RUNNER_ID: runnerId,
      }
    )
  }

  return context
}

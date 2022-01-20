import { PrbError, prb } from '@phala/runtime-bridge-walkie'
import Worker from '../local_db/worker_model'
import type { MakeLifecycleManagerPtpHandler } from '.'

export const makeRestartWorker: MakeLifecycleManagerPtpHandler<
  'RestartWorker'
> = (context) => async (request) => {
  const ids = request.ids
  for (const id of ids) {
    const workerObj = await Worker.findByPk(id)
    if (!workerObj) {
      throw new PrbError(
        prb.error.ResponseErrorType.NOT_FOUND,
        `Worker ${id} not found!`
      )
    }
  }

  console.log(1111111, request, ids)

  for (const id of ids) {
    context.runnerManager.workers[id].runner.ipcHandle.send(
      'runnerShouldRestartWorker',
      [id]
    )
  }

  return prb.WorkerStateUpdate.create({
    workerStates: ids.map((i) => context.runnerManager.workers[i]),
  })
}

export const makeKickWorker: MakeLifecycleManagerPtpHandler<'KickWorker'> =
  (context) =>
  async ({ ids }) => {
    for (const id of ids) {
      const workerObj = await Worker.findByPk(id)
      if (!workerObj) {
        throw new PrbError(
          prb.error.ResponseErrorType.NOT_FOUND,
          `Worker ${id} not found!`
        )
      }
    }

    for (const id of ids) {
      context.runnerManager.workers[id].runner.ipcHandle.send(
        'runnerShouldKickWorker',
        [id]
      )
    }

    return prb.WorkerStateUpdate.create({
      workerStates: ids.map((i) => context.runnerManager.workers[i]),
    })
  }

export const makeGetWorkerStatus: MakeLifecycleManagerPtpHandler<
  'GetWorkerStatus'
> =
  (context) =>
  async ({ ids }) => {
    if (ids?.length) {
      for (const id of ids) {
        const workerObj = await Worker.findByPk(id)
        if (!workerObj) {
          throw new PrbError(
            prb.error.ResponseErrorType.NOT_FOUND,
            `Worker ${id} not found!`
          )
        }
      }
    }
    const _ids = ids?.length ? ids : Object.keys(context.runnerManager.workers)

    return prb.WorkerStateUpdate.create({
      workerStates: _ids.map((i) => context.runnerManager.workers[i]),
    })
  }

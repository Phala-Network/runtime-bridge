import type { RunnerContext } from './index'
import type { StateMachine } from 'finity'
import type BN from 'bn.js'
import type Pool from '../local_db/pool_model'
import type Worker from '../local_db/worker_model'

export type WorkerContext = { [k: string]: unknown } & {
  _worker: Worker
  context: RunnerContext
  appContext: RunnerContext
  pid: string
  pool: Pool
  poolSnapshot: ReturnType<Pool['toPbInterface']>
  poolOwner: Pool['operator']
  snapshotBrief: ReturnType<Worker['toPbInterface']>
  snapshot: ReturnType<Pool['toPbInterface']> &
    ReturnType<Worker['toPbInterface']>
  workerBrief: ReturnType<Worker['toPbInterface']>
  worker: ReturnType<Pool['toPbInterface']> &
    ReturnType<Worker['toPbInterface']>
  stakeBn: BN
  stateMachine: StateMachine<string, string>
}
export type WorkerContextMap = { [k: string]: WorkerContext }

export const createWorkerContext: (
  worker: Worker,
  context: RunnerContext
) => Promise<WorkerContext>

export const destroyWorkerContext: (
  context: WorkerContext,
  shouldKick: boolean
) => Promise<void>

export const getWorkerStates: (
  ids: string[],
  workers: WorkerContextMap
) => { [k: string]: prb.IWorkerState }

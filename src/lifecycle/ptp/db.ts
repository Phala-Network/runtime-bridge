import { PrbError, prb } from '@phala/runtime-bridge-walkie'
import Pool from '../local_db/pool_model'
import Worker from '../local_db/worker_model'
import type { Long } from 'protobufjs'
import type { MakeLifecycleManagerPtpHandler } from '.'
import type { PoolLookupTable } from '../local_db/pool_model'
import ResponseErrorType = prb.error.ResponseErrorType

export const makeListPool: MakeLifecycleManagerPtpHandler<'ListPool'> =
  () => async () => {
    const pools = await Pool.findAll()
    return prb.lifecycle.PoolList.create({
      pools: pools.map((p) => p.toPbInterface()),
    })
  }

export const makeCreatePool: MakeLifecycleManagerPtpHandler<'CreatePool'> =
  ({ localDb }) =>
  async ({ pools }) => {
    const transaction = await localDb.transaction()
    const retPools: Pool[] = []
    try {
      for (const r of pools) {
        const pool = new Pool({
          pid: r.pid,
          name: r.name,
          enabled: r.enabled,
          proxiedAccountSs58: r.realPhalaSs58,
          syncOnly: r.syncOnly,
        })
        pool.operatorMnemonic = r.owner.mnemonic
        await pool.save({ transaction })
        retPools.push(pool)
      }
      await transaction.commit()
      return prb.lifecycle.PoolList.create({
        pools: retPools.map((i) => i.toPbInterface()),
      })
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  }

export const makeUpdatePool: MakeLifecycleManagerPtpHandler<'UpdatePool'> =
  ({ localDb }) =>
  async ({ items }) => {
    const transaction = await localDb.transaction()
    const retPools: Pool[] = []
    try {
      for (const i of items) {
        const { id, pool } = i
        let ret: Pool
        if (id.uuid) {
          ret = await Pool.findOne({ where: { id: id.uuid } })
        } else if (id.name) {
          ret = await Pool.findOne({ where: { name: id.name } })
        } else {
          ret = await Pool.findOne({
            where: {
              pid:
                typeof id.pid === 'number'
                  ? (id.pid as number)
                  : (id.pid as Long.Long).toNumber(),
            },
          })
        }
        if (!pool) {
          throw new PrbError(
            ResponseErrorType.NOT_FOUND,
            `Can't find pool: ${JSON.stringify(id)}`
          )
        }
        if (pool.deleted) {
          await ret.destroy({ transaction })
        } else {
          if (pool.owner?.mnemonic) {
            ret.operatorMnemonic = pool.owner.mnemonic
          }
          ret.pid =
            typeof pool.pid === 'number'
              ? (pool.pid as number)
              : (pool.pid as Long.Long).toNumber()
          ret.name = pool.name
          ret.enabled = pool.enabled
          ret.proxiedAccountSs58 = pool.realPhalaSs58
          ret.syncOnly = pool.syncOnly
          await ret.save({ transaction })
          retPools.push(ret)
        }
      }
      await transaction.commit()
      return prb.lifecycle.PoolList.create({
        pools: retPools.map((i) => i.toPbInterface()),
      })
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  }

export const makeListWorker: MakeLifecycleManagerPtpHandler<'ListWorker'> =
  () => async () => {
    const workers = await Worker.findAll({ include: [Pool] })
    return prb.lifecycle.WorkerList.create({
      workers: workers.map((w) => w.toPbInterface()),
    })
  }

export const makeCreateWorker: MakeLifecycleManagerPtpHandler<'CreateWorker'> =
  ({ localDb }) =>
  async ({ workers }) => {
    const transaction = await localDb.transaction()
    const poolLookupTable: PoolLookupTable = {}
    const retWorkers: Worker[] = []

    try {
      for (const w of workers) {
        const pid =
          typeof w.pid === 'number'
            ? (w.pid as number)
            : (w.pid as Long.Long).toNumber()
        if (!poolLookupTable[pid]) {
          poolLookupTable[pid] = await Pool.findOne({ where: { pid } })
        }
        if (!poolLookupTable[pid]) {
          throw new PrbError(
            ResponseErrorType.NOT_FOUND,
            `Pool {pid:${pid} not found!`
          )
        }
        const worker = new Worker({
          name: w.name,
          endpoint: w.endpoint,
          enabled: w.enabled,
          stake: w.stake,
          poolId: poolLookupTable[pid].id,
          syncOnly: w.syncOnly,
        })

        worker.pool = poolLookupTable[pid]
        await worker.save({ transaction })
        retWorkers.push(worker)
      }
      await transaction.commit()
      return prb.lifecycle.WorkerList.create({
        workers: retWorkers.map((w) => w.toPbInterface()),
      })
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  }

export const makeUpdateWorker: MakeLifecycleManagerPtpHandler<'UpdateWorker'> =
  ({ localDb }) =>
  async ({ items }) => {
    const transaction = await localDb.transaction()
    const poolLookupTable: PoolLookupTable = {}
    const retWorkers: Worker[] = []

    try {
      for (const i of items) {
        const { id, worker } = i
        let ret: Worker
        if (id.uuid) {
          ret = await Worker.findOne({ where: { id: id.uuid } })
        } else if (id.name) {
          ret = await Worker.findOne({ where: { name: id.name } })
        }
        if (!worker) {
          throw new PrbError(
            ResponseErrorType.NOT_FOUND,
            `Can't find worker: ${JSON.stringify(id)}`
          )
        }
        if (worker.deleted) {
          await ret.destroy({ transaction })
        } else {
          const pid =
            typeof worker.pid === 'number'
              ? (worker.pid as number)
              : (worker.pid as Long.Long).toNumber()
          if (!poolLookupTable[pid]) {
            poolLookupTable[pid] = await Pool.findOne({ where: { pid } })
          }
          if (!poolLookupTable[pid]) {
            throw new PrbError(
              ResponseErrorType.NOT_FOUND,
              `Pool {pid:${pid} not found!`
            )
          }
          ret.pool = poolLookupTable[pid]
          ret.poolId = poolLookupTable[pid].id
          ret.name = worker.name
          ret.endpoint = worker.endpoint
          ret.enabled = worker.enabled
          ret.stake = worker.stake
          ret.syncOnly = worker.syncOnly
          await ret.save({ transaction })
          retWorkers.push(ret)
        }
      }
      await transaction.commit()
      return prb.lifecycle.WorkerList.create({
        workers: retWorkers.map((w) => w.toPbInterface()),
      })
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  }

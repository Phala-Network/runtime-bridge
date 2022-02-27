import { LIFECYCLE, getMyId } from '../utils/my-id'
import { keyring } from '../utils/api'
import { migrator as migratorPb } from './migrate_proto'
import { setupLocalDb } from '../lifecycle/local_db'
import EncodingDown from 'encoding-down'
import Pool from '../lifecycle/local_db/pool_model'
import Worker from '../lifecycle/local_db/worker_model'
import levelUp from 'levelup'
import logger from '../utils/logger'
import path from 'path'
import rocksdb from 'rocksdb'

const OLD_DATA_PATH = process.env.OLD_DATA_PATH ?? '/var/data_old/'

const getAll = async (db, name, pbType) =>
  (
    await new Promise((resolve, reject) => {
      const stream = db.createValueStream({
        gte: `${name}:id:`,
        lte: `${name}:id:` + '~',
      })
      const ret = []
      stream.on('data', async (value) => {
        ret.push(value)
      })
      stream.on('end', () => resolve(ret))
      stream.on('error', reject)
    })
  )
    .map((buf) => pbType.decode(buf))
    .map((pb) =>
      pbType.toObject(pb, {
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
        json: true,
        longs: Number,
      })
    )
    .filter((i) => !i.deleted)

const migratePool = async (myId) => {
  const db1 = levelUp(
    EncodingDown(rocksdb(path.join(OLD_DATA_PATH, '1')), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })
  )
  const pools = await getAll(db1, 'pool', migratorPb.Pool)
  const workers = await getAll(db1, 'worker', migratorPb.Worker)

  if (!pools.length) {
    logger.warn('No pool found, quitting.')
    return false
  }

  const localDb = await setupLocalDb(myId)

  const transaction = await localDb.transaction()
  const workerLookupTable = {}
  try {
    for (const rp of pools) {
      const p = Pool.build({
        pid: rp.pid,
        name: rp.name,
        enabled: true,
        proxiedAccountSs58: rp.realPhalaSs58,
      })
      p.operator = keyring.addFromJson(JSON.parse(rp.owner.polkadotJson))
      await p.save({ transaction })
      workerLookupTable[p.pid] = p
    }
  } catch (e) {
    await transaction.rollback()
    logger.warn('Error while migrating pools.')
    logger.error(e)
    return false
  }

  if (!workers.length) {
    logger.warn('No pool found, quitting.')
    return false
  }

  try {
    for (const rw of workers) {
      const pool = workerLookupTable[rw.pid]
      if (pool) {
        const worker = Worker.build({
          name: rw.name,
          endpoint: rw.endpoint,
          stake: rw.stake,
          enabled: true,
        })
        worker.poolId = pool.id
        await worker.save({ transaction })
      } else {
        logger.warn(`Pool #${rw.pid} not found for worker:`, rw)
      }
    }
  } catch (e) {
    await transaction.rollback()
    logger.warn('Error while migrating workers.')
    logger.error(e)
    return false
  }

  try {
    await transaction.commit()
  } catch (e) {
    logger.warn('Error while committing database.')
    logger.error(e)
    return false
  }

  return true
}

async function main() {
  const idLifecycle = await getMyId(LIFECYCLE)

  const resultMigratePool = await migratePool(idLifecycle)

  console.log(
    JSON.stringify({
      ok: true,
      idLifecycle: idLifecycle.toB58String(),
      resultMigratePool,
    })
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(255)
})

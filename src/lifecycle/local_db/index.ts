import { Sequelize } from 'sequelize'
import Pool, { initPoolModel } from './pool_model'
import Worker, { initWorkerModel } from './worker_model'
import env from '../../utils/env'
import logger from '../../utils/logger'
import type PeerId from 'peer-id'

export const setupLocalDb = async (myId: PeerId) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: env.localDbPath || '/var/data/local.db',
    dialectModule: (await import('@journeyapps/sqlcipher')).default,
    logging: (sql) => logger.debug(sql),
  })

  initPoolModel(db)
  initWorkerModel(db)

  Worker.Pool = Worker.belongsTo(Pool)
  Pool.Worker = Pool.hasMany(Worker)

  await db.query('PRAGMA cipher_compatibility = 4')
  await db.query(
    `PRAGMA key = "x'${Buffer.from((await myId.privKey.hash()).slice(2, 34))
      .toString('hex')
      .toUpperCase()}'"`,
    {
      logging: false,
    }
  )

  await db.sync()
  return db
}

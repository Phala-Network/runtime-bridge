import { OPEN_READONLY, OPEN_READWRITE } from 'sqlite3'
import { Sequelize } from 'sequelize-typescript'
import Pool from './pool_model'
import Worker from './worker_model'
import cluster from 'cluster'
import env from '../../utils/env'
import logger from '../../utils/logger'
import type { PrbPeerId } from '../../utils/my-id'

export const dbLogger = (sql: string) => logger.debug(sql)

export const setupLocalDb = async (myId: PrbPeerId) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: env.localDbPath || '/var/data/local.db',
    logging: dbLogger,
    models: [Pool, Worker],
    dialectOptions: {
      mode: cluster.isPrimary ? OPEN_READWRITE : OPEN_READONLY,
    },
  })
  Pool.myId = myId

  if (cluster.isPrimary) {
    await db.sync()
  }

  return db
}

import { OPEN_READONLY } from 'sqlite3'
import { Sequelize } from 'sequelize-typescript'
import Pool from './pool_model'
import Worker from './worker_model'
import cluster from 'cluster'
import env from '../../utils/env'
import logger from '../../utils/logger'
import type { PrbPeerId } from '../../utils/my-id'

export const dbLogger = (sql: string) => logger.debug(sql)

export const setupLocalDb = async (myId: PrbPeerId, readonly = false) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: env.localDbPath || '/var/data/local.db',
    logging: dbLogger,
    models: [Pool, Worker],
    dialectOptions:
      !readonly && cluster.isPrimary
        ? {}
        : {
            mode: OPEN_READONLY,
          },
  })
  Pool.myId = myId

  if (cluster.isPrimary) {
    await db.sync({
      alter: {
        drop: false,
      },
    })
  }

  return db
}

import { Sequelize } from 'sequelize-typescript'
import Pool from './pool_model'
import Worker from './worker_model'
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
  })
  Pool.myId = myId
  await db.sync()
  return db
}

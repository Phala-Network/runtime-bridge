import { Sequelize } from 'sequelize-typescript'
import Pool from './pool_model'
import Worker from './worker_model'
import env, { isDev } from '../../utils/env'
import logger from '../../utils/logger'
import type { PrbPeerId } from '../../utils/my-id'

export const dbLogger = (sql: string) => logger.debug(sql)

export const setupLocalDb = async (myId: PrbPeerId) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: env.localDbPath || '/var/data/local.db',
    dialectModule: (await import('@journeyapps/sqlcipher')).default,
    logging: dbLogger,
    models: [Pool, Worker],
  })

  Pool.myId = myId

  await db.query('PRAGMA cipher_compatibility = 4')
  await db.query(
    `PRAGMA key = "x'${Buffer.from((await myId.privKey.hash()).slice(2, 34))
      .toString('hex')
      .toUpperCase()}'"`,
    {
      logging: isDev ? dbLogger : false,
    }
  )

  await db.sync()

  return db
}

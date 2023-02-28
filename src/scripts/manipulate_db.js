import { Command } from 'commander'
import { DB_WORKER, setupDb } from '../data_provider/io/db'
import {
  LAST_COMMITTED_PARA_BLOCK,
  LAST_COMMITTED_PARA_BLOCK_BATCH,
} from '../utils/constants'
import logger from '../utils/logger'

const main = async (p, k) => {
  if (!p.length) {
    logger.info('No parachain blocks to remove.')
  } else {
    logger.info({ p }, 'Parachain blocks to remove:')
    k.push(LAST_COMMITTED_PARA_BLOCK)
    k.push(LAST_COMMITTED_PARA_BLOCK_BATCH)
  }
  for (let i of p) {
    k.push(`para:${i}:pb`)
    k.push(`para:${i}:written`)
  }
  if (!k.length) {
    logger.info('No keys to remove, exiting.')
    process.exit(0)
  } else {
    logger.info({ keys: k }, 'Keys to remove')
  }

  const db = await setupDb(DB_WORKER)
  let batch = db.batch()
  for (let kk of k) {
    batch = batch.del(kk)
  }
  await batch.write()
  logger.info('Job done.')
  process.exit(0)
}

const program = new Command()
program
  .option(
    '-p, --para <char>',
    'Parachain blocks to be deleted, seperated by comma',
    ''
  )
  .option(
    '-k, --keys <char>',
    'Force keys to be deleted, seperated by comma',
    ''
  )

const p = program
  .parse()
  .opts()
  .para.split(',')
  .map((i) => i.trim())
  .filter((i) => i)
  .map((i) => parseInt(i))
const k = program
  .parse()
  .opts()
  .keys.split(',')
  .map((i) => i.trim())
  .filter((i) => i)

main(p, k)
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(255)
  })

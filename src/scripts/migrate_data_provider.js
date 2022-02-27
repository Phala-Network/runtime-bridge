import { DATA_PROVIDER, getMyId } from '../utils/my-id'
import {
  LAST_COMMITTED_PARA_BLOCK,
  LAST_COMMITTED_PARENT_BLOCK,
} from '../utils/constants'
import { setupPhalaApi } from '../utils/api'
import EncodingDown from 'encoding-down'
import env from '../utils/env'
import fs from 'fs/promises'
import levelUp from 'levelup'
import logger from '../utils/logger'
import path from 'path'
import rocksdb from 'rocksdb'

const OLD_DATA_PATH = process.env.OLD_DATA_PATH ?? '/var/data_old/'
const NEW_DATA_PATH = process.env.NEW_DATA_PATH ?? '/var/data/'

const migrateBlock = async (parentStart) => {
  const oldDb = levelUp(
    EncodingDown(rocksdb(path.join(OLD_DATA_PATH, '0')), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })
  )
  const paraTarget =
    parseInt(
      await oldDb.get(LAST_COMMITTED_PARA_BLOCK, {
        keyEncoding: 'utf8',
        valueEncoding: 'json',
      })
    ) || 0
  const parentTarget =
    parseInt(
      await oldDb.get(LAST_COMMITTED_PARENT_BLOCK, {
        keyEncoding: 'utf8',
        valueEncoding: 'json',
      })
    ) || 0

  if (!paraTarget || !parentTarget) {
    logger.warn('Committed block height not found in database, skipping.')
    return false
  }

  const newDbPath = path.join(NEW_DATA_PATH, '0')
  await fs.mkdir(newDbPath, { recursive: true })

  const newDb = levelUp(
    EncodingDown(rocksdb(newDbPath), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary',
    })
  )

  const buffer1 = Buffer.from([1])

  let currentPara = 0
  let currentParent = 0

  const logInterval = setInterval(() => {
    logger.info(
      { paraTarget, currentPara, parentStart, parentTarget, currentParent },
      'Migrating blocks.'
    )
  }, 1000)

  for (let i = 1; i < paraTarget; i++) {
    const currPbKey = `para:${i}:pb`
    const currWrittenKey = `para:${i}:written`
    const oldPb = await oldDb.get(currPbKey)
    await oldDb.get(currPbKey)
    await newDb.put(currPbKey, oldPb)
    await newDb.put(currWrittenKey, buffer1)
    currentPara = i
  }

  for (let i = parentStart; i < parentTarget; i++) {
    const currPbKey = `parent:${i}:pb`
    const currWrittenKey = `parent:${i}:written`
    const oldPb = await oldDb.get(currPbKey)
    await oldDb.get(currPbKey)
    await newDb.put(currPbKey, oldPb)
    await newDb.put(currWrittenKey, buffer1)
    currentParent = i
  }

  clearInterval(logInterval)

  return true
}

async function main() {
  const idDataProvider = await getMyId(DATA_PROVIDER)
  const phalaApi = await setupPhalaApi(env.chainEndpoint)
  const paraId = (await phalaApi.query.parachainInfo.parachainId()).toNumber()
  const parentNumber =
    (
      await phalaApi.query.parachainSystem.validationData.at(
        await phalaApi.rpc.chain.getBlockHash(1)
      )
    )
      .unwrapOrDefault()
      .relayParentNumber.toJSON() - 1
  const resultMigrateBlock = await migrateBlock(parentNumber)

  console.log(
    JSON.stringify({
      ok: true,
      idDataProvider: idDataProvider.toB58String(),
      paraId,
      resultMigrateBlock,
    })
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(255)
})

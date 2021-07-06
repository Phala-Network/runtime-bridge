import { DB_ENCODING_BINARY } from './db_encoding'
import { DB_WINDOW, getDb } from './db'
import PQueue from 'p-queue'
import logger from '../utils/logger'
import wait from '../utils/wait'

export const createGetBlockBlobReadonlyContext = () => {
  const windowDb = getDb(DB_WINDOW)
  let knownHeight = -1

  const taskQueue = []
  const ioQueue = new PQueue({})

  const updateKnownHeight = async () => {
    await windowDb.close()
    await wait(2000)
    await windowDb.open({ readOnly: true })
    knownHeight = await windowDb.get('dry')
  }

  const getHeaderBlob = async ({ blockNumber, resolve, reject }) => {
    try {
      const meta = await windowDb.get(`rangeByBlock:${blockNumber}`)
      await windowDb.open()
      const blobSyncHeaderReq = await windowDb.get(
        blockNumber === meta.startBlock
          ? meta.blobSyncHeaderReqKey || meta.drySyncHeaderReqKey
          : meta.drySyncHeaderReqKey,
        {
          ...DB_ENCODING_BINARY,
        }
      )
      resolve(blobSyncHeaderReq)
    } catch (error) {
      reject(error)
    }
  }

  const getBlockBlob = async ({ blockNumber, resolve, reject }) => {
    try {
      const meta = await windowDb.get(`rangeByBlock:${blockNumber}`)
      await windowDb.open()
      const blobDispatchBlockReq = await windowDb.get(
        blockNumber === meta.startBlock
          ? meta.blobDispatchBlockReqKey || meta.dryDispatchBlockReqKey
          : meta.dryDispatchBlockReqKey,
        {
          ...DB_ENCODING_BINARY,
        }
      )
      resolve(blobDispatchBlockReq)
    } catch (error) {
      reject(error)
    }
  }

  const processTasks = async () => {
    if (taskQueue.length === 0) {
      await wait(1)
      return processTasks()
    }

    const task = taskQueue.shift()

    if (task.blockNumber > knownHeight) {
      await ioQueue.add(() => updateKnownHeight())
      taskQueue.push(task)
      return processTasks()
    }

    ioQueue.add(() => task.fn(task))
    return processTasks()
  }

  ioQueue
    .add(() => updateKnownHeight())
    .then(() => processTasks())
    .catch((error) => {
      logger.error(error)
      process.exit(255)
    })

  return {
    getHeaderBlob: (blockNumber) =>
      new Promise((resolve, reject) => {
        taskQueue.push({ blockNumber, resolve, reject, fn: getHeaderBlob })
      }),
    getBlockBlob: (blockNumber) =>
      new Promise((resolve, reject) => {
        taskQueue.push({ blockNumber, resolve, reject, fn: getBlockBlob })
      }),
  }
}

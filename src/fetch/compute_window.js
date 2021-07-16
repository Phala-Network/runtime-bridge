import { BLOB_MAX_RANGE_COUNT } from '../utils/constants'
import { DB_BLOCK, DB_WINDOW, setupDb } from '../io/db'
import { SET_ARCHIVED_HEIGHT, SET_BLOB_HEIGHT } from '.'
import {
  commitBlobRange,
  getWindow,
  setDryRange,
  setEmptyWindow,
  updateWindow,
} from '../io/window'
import { setupPhalaApi } from '../utils/api'
import { waitForBlock } from '../io/block'
import env from '../utils/env'
import logger from '../utils/logger'

let startLock = false

export const range = (start, stop, step = 1) =>
  Array(Math.ceil((stop - start + 1) / step))
    .fill(start)
    .map((x, y) => x + y * step)

const lazySetDryRange = async (
  startBlock,
  stopBlock,
  latestSetId,
  setIdChanged,
  currentBlock
) => {
  const ret = await setDryRange(
    startBlock,
    stopBlock,
    latestSetId,
    setIdChanged
  )
  process.send({ [SET_BLOB_HEIGHT]: currentBlock })
  return ret
}

const lazyCommitBlobRange = async (rangePromises, currentBlock) => {
  const rangePromises__copy = [...rangePromises]
  rangePromises.length = 0
  const ranges = await Promise.all(rangePromises__copy)
  await commitBlobRange(ranges)
  process.send({ [SET_ARCHIVED_HEIGHT]: currentBlock })
  return true
}

const walkBlock = async (
  currentWindow,
  lastWindow,
  blockNumber,
  context,
  ranges,
  lastBlock = null
) => {
  try {
    const currentBlock = await waitForBlock(blockNumber)

    let nextContext
    let _currentWindow = currentWindow

    if (currentBlock.hasJustification) {
      context.stopBlock = blockNumber

      ranges.push(
        await lazySetDryRange(
          context.startBlock,
          context.stopBlock,
          currentBlock.setId,
          currentBlock.setId > lastBlock?.setId,
          currentBlock.blockNumber
        )
      )

      nextContext = {
        startBlock: blockNumber + 1,
        stopBlock: -1,
      }
    } else {
      nextContext = context
    }

    let alreadyRequestedCommit = false

    if (ranges.length >= BLOB_MAX_RANGE_COUNT) {
      lazyCommitBlobRange(ranges, currentBlock.blockNumber)
      alreadyRequestedCommit = true
    }

    if (currentBlock.setId > lastBlock?.setId) {
      if (!alreadyRequestedCommit) {
        lazyCommitBlobRange(ranges, currentBlock.blockNumber)
      }

      await updateWindow(currentWindow, {
        currentBlock: currentBlock.blockNumber,
        stopBlock: currentBlock.blockNumber,
        isFinished: true,
      })
      return
    }

    if (currentWindow.setId === -1) {
      _currentWindow = await updateWindow(currentWindow, {
        setId: currentBlock.setId,
      })
    }

    _currentWindow.currentBlock = currentBlock.blockNumber

    return walkBlock(
      _currentWindow,
      lastWindow,
      blockNumber + 1,
      nextContext,
      ranges,
      currentBlock
    )
  } catch (error) {
    logger.error(error)
    process.exit(-1)
  }
}

const walkWindow = async (windowId = 0, lastWindow = null) => {
  let currentWindow = await getWindow(windowId)
  if (currentWindow && currentWindow.isFinished) {
    $logger.info(currentWindow, `Window found in cache.`)
    return walkWindow(windowId + 1, currentWindow)
  }

  let startBlock

  if (currentWindow) {
    startBlock = currentWindow.startBlock
  } else {
    startBlock = windowId > 0 ? lastWindow.stopBlock + 1 : 1
    currentWindow = await setEmptyWindow(windowId, startBlock)
  }

  logger.info({ startBlock }, `Processing window #${windowId}...`)

  const context = {
    startBlock,
    stopBlock: -1,
  }

  const ranges = []

  await walkBlock(currentWindow, lastWindow, startBlock, context, ranges)
  logger.info(currentWindow, `Processed window.`)
  return walkWindow(windowId + 1, currentWindow)
}

export default async () => {
  if (startLock) {
    throw new Error('Unexpected re-initialization.')
  }
  await setupDb(DB_WINDOW, DB_BLOCK)
  await setupPhalaApi(env.chainEndpoint)
  await walkWindow()
}

import { DB_BLOCK, DB_WINDOW, setupDb } from '../io/db'
import {
  getWindow,
  setBlobRangeEnd,
  setEmptyWindow,
  updateWindow,
} from '../io/window'
import { waitForBlock } from '../io/block'
import logger from '../utils/logger'

let startLock = false

export const range = (start, stop, step = 1) =>
  Array(Math.ceil((stop - start + 1) / step))
    .fill(start)
    .map((x, y) => x + y * step)

const walkBlock = async (
  currentWindow,
  lastWindow,
  blockNumber,
  context,
  lastBlock = null
) => {
  try {
    const currentBlock = await waitForBlock(blockNumber)

    let nextContext

    if (currentBlock.hasJustification) {
      context.stopBlock = blockNumber

      await Promise.all(
        range(context.startBlock, context.stopBlock).map((i) =>
          setBlobRangeEnd(i, context.stopBlock)
        )
      )

      logger.info(context, 'Created blob index.')

      nextContext = {
        startBlock: blockNumber + 1,
        stopBlock: -1,
      }
    } else {
      nextContext = context
    }

    if (currentBlock.setId > lastBlock?.setId) {
      await updateWindow(currentWindow, {
        currentBlock: currentBlock.blockNumber,
        stopBlock: currentBlock.blockNumber,
        isFinished: true,
      })
      return
    }

    await updateWindow(
      currentWindow,
      currentWindow.setId === -1
        ? {
            currentBlock: currentBlock.blockNumber,
            setId: currentBlock.setId,
          }
        : { currentBlock: currentBlock.blockNumber }
    )

    return walkBlock(
      currentWindow,
      lastWindow,
      blockNumber + 1,
      nextContext,
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
    startBlock =
      currentWindow.currentBlock > -1
        ? currentWindow.currentBlock + 1
        : currentWindow.startBlock
  } else {
    startBlock = windowId > 0 ? lastWindow.stopBlock + 1 : 0
    currentWindow = await setEmptyWindow(windowId, startBlock)
  }

  logger.info(`Processing window #${windowId}...`)

  const context = {
    startBlock,
    stopBlock: -1,
  }

  await walkBlock(currentWindow, lastWindow, startBlock, context)
  logger.info(currentWindow, `Processed window.`)
  return walkWindow(windowId + 1, currentWindow)
}

export default async () => {
  if (startLock) {
    throw new Error('Unexpected re-initialization.')
  }
  await setupDb([DB_WINDOW], [DB_BLOCK])
  await walkWindow()
}

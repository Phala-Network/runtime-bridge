import {
  BLOB_MAX_PARA_BLOCK_RANGE_COUNT,
  BLOB_MAX_RANGE_COUNT,
} from '../utils/constants'
import { DB_BLOCK, DB_WINDOW, setupDb } from '../io/db'
import {
  SET_PARA_ARCHIVED_HEIGHT,
  SET_PARA_BLOB_HEIGHT,
  SET_PARENT_ARCHIVED_HEIGHT,
  SET_PARENT_BLOB_HEIGHT,
} from '.'
import {
  setDryRange as _setDryRange,
  commitBlobRange,
  commitParaBlockRange,
  getLastCommittedParaBlock,
  getWindow,
  setDryParaBlockRange,
  setEmptyWindow,
  updateWindow,
} from '../io/window'
import { getGenesis, waitForParaBlock, waitForParentBlock } from '../io/block'
import { setupParentApi, setupPhalaApi } from '../utils/api'
import env from '../utils/env'
import logger from '../utils/logger'

const setDryRange = async (context, latestSetId, setIdChanged) => {
  const { parentStartBlock, paraStartBlock, paraBlocks, parentBlocks } = context

  const _parentStopBlock = parentBlocks[parentBlocks.length - 1]
  const _paraStopBlock = paraBlocks.length
    ? paraBlocks[paraBlocks.length - 1]
    : null
  const parentStopBlock = _parentStopBlock.number

  const ret = await _setDryRange(
    parentStartBlock,
    _paraStopBlock ? paraStartBlock : -1,
    paraBlocks,
    parentBlocks,
    latestSetId,
    setIdChanged
  )

  process.send({ type: SET_PARENT_BLOB_HEIGHT, payload: parentStopBlock })
  return ret
}

const lazyCommitBlobRange = async (
  rangePromises,
  paraRanges,
  currParentBlockNumber
) => {
  const rangePromises__copy = [...rangePromises]
  const paraRanges__copy = [...paraRanges]
  rangePromises.length = 0
  paraRanges.length = 0
  const ranges = await Promise.all(rangePromises__copy)
  await commitBlobRange(ranges, paraRanges__copy)

  process.send({
    type: SET_PARENT_ARCHIVED_HEIGHT,
    payload: currParentBlockNumber,
  })
  return true
}

const walkBlock = async (
  currentWindow,
  lastWindow,
  parentNumber,
  paraNumberOrBlock,
  context,
  ranges,
  paraRanges,
  lastParentBlock = null
) => {
  try {
    let nextContext
    let paraNumberMatched = false

    const currParentBlock = await waitForParentBlock(parentNumber)
    const currParaBlock =
      typeof paraNumberOrBlock === 'object'
        ? paraNumberOrBlock
        : await waitForParaBlock(paraNumberOrBlock)

    context.parentBlocks.push(currParentBlock)

    if (currParaBlock.number === currParentBlock.paraNumber) {
      context.paraBlocks.push(currParaBlock)
      paraRanges.push(currParaBlock.number)
      paraNumberMatched = true
    }

    if (currParentBlock.hasJustification) {
      context.stopBlock = currParentBlock

      ranges.push(
        setDryRange(
          context,
          currParentBlock.setId,
          currParentBlock.setId > lastParentBlock?.setId,
          currParentBlock.number
        )
      )

      nextContext = {
        parentStartBlock: currParentBlock.number + 1,
        paraStartBlock: paraNumberMatched
          ? currParaBlock.number + 1
          : currParaBlock.number,
        paraBlocks: [],
        parentBlocks: [],
      }
    } else {
      nextContext = context
    }

    let alreadyRequestedCommit = false
    let paraRanges__copy

    if (ranges.length >= BLOB_MAX_RANGE_COUNT) {
      paraRanges__copy = [...paraRanges]
      lazyCommitBlobRange(
        ranges,
        paraRanges,
        currParentBlock.number,
        currParaBlock.number
      )
      alreadyRequestedCommit = true
    }

    if (currParentBlock.setId > lastParentBlock?.setId) {
      if (!alreadyRequestedCommit) {
        paraRanges__copy = [...paraRanges]
        lazyCommitBlobRange(
          ranges,
          paraRanges,
          currParentBlock.number,
          currParaBlock.number
        )
      }

      const updated = {
        parentStopBlock:
          context.parentBlocks[context.parentBlocks.length - 1].number,
        paraStopBlock: !paraRanges__copy.length
          ? currentWindow.paraStartBlock === currParaBlock.number
            ? currentWindow.paraStartBlock
            : currParaBlock.number - 1
          : paraRanges__copy[paraRanges__copy.length - 1],
        isFinished: true,
      }

      Object.assign(currentWindow, await updateWindow(currentWindow, updated))

      return
    }

    if (currentWindow.setId === -1) {
      Object.assign(
        currentWindow,
        await updateWindow(currentWindow, {
          setId: currParentBlock.setId,
        })
      )
    }

    return walkBlock(
      currentWindow,
      lastWindow,
      currParentBlock.number + 1,
      paraNumberMatched ? currParaBlock.number + 1 : currParaBlock.number,
      nextContext,
      ranges,
      paraRanges,
      currParentBlock
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

  let parentStartBlock, paraStartBlock
  let lastParentBlockData = null

  if (currentWindow) {
    parentStartBlock = currentWindow.parentStartBlock
    paraStartBlock = currentWindow.paraStartBlock
  } else {
    if (windowId === 0) {
      const paraId = process.env.PHALA_IPC_PARA_ID
      const genesis = await getGenesis(paraId)
      const { paraNumber: gParaNumber, parentNumber: gParentNumber } = genesis
      parentStartBlock = gParentNumber + 1
      paraStartBlock = gParaNumber + 1
      lastParentBlockData = await waitForParentBlock(gParentNumber)
    } else {
      parentStartBlock = lastWindow.parentStopBlock + 1

      paraStartBlock =
        lastWindow.paraStartBlock === lastWindow.paraStopBlock
          ? lastWindow.paraStopBlock
          : lastWindow.paraStopBlock + 1
    }

    currentWindow = await setEmptyWindow(
      windowId,
      parentStartBlock,
      paraStartBlock
    )
  }

  logger.info({ parentStartBlock }, `Processing window #${windowId}...`)

  const context = {
    parentStartBlock,
    paraStartBlock,
    paraBlocks: [],
    parentBlocks: [],
  }

  const ranges = []
  const paraRanges = []

  await walkBlock(
    currentWindow,
    lastWindow,
    parentStartBlock,
    paraStartBlock,
    context,
    ranges,
    paraRanges,
    lastParentBlockData
  )
  logger.info(currentWindow, `Processed window.`)
  return walkWindow(windowId + 1, currentWindow)
}

const walkParaBlock = async (number, blocks) => {
  if (blocks.length > BLOB_MAX_PARA_BLOCK_RANGE_COUNT) {
    await commitParaBlockRange(blocks)
    process.send({
      type: SET_PARA_ARCHIVED_HEIGHT,
      payload: number - 1,
    })
    blocks.length = 0
  }
  const block = await waitForParaBlock(number)
  blocks.push(block)
  await setDryParaBlockRange(block)
  process.send({ type: SET_PARA_BLOB_HEIGHT, payload: number })

  return walkParaBlock(number + 1, blocks)
}

export default async () => {
  await Promise.all([
    setupDb(DB_WINDOW, DB_BLOCK),
    setupParentApi(env.parentChainEndpoint),
    setupPhalaApi(env.chainEndpoint),
  ])
  await Promise.all([
    walkWindow(),
    walkParaBlock((await getLastCommittedParaBlock()) + 1, []),
  ])
}

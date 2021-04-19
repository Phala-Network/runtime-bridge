import { APP_VERIFIED_WINDOW_ID } from '../utils/constants'
import wait from '../utils/wait'
import { getModel } from 'ottoman'

const computeWindow = async ({ chainName, redis, BlockModel }) => {
  const CHAIN_APP_VERIFIED_WINDOW_ID = `${chainName}:${APP_VERIFIED_WINDOW_ID}`
  const RuntimeWindow = getModel('RuntimeWindow')

  let latestWindowId =
    parseInt((await redis.get(CHAIN_APP_VERIFIED_WINDOW_ID)) || 0) - 1

  const getBlock = async (number) => {
    const block = await BlockModel.findOne({ number }).catch((e) => {
      if (e.message === 'path exists') {
        $logger.warn('Index not found, retrying in 10s...')
        return wait(10000).then(() => getBlock(number))
      }
      if (e.message === 'document not found') {
        $logger.info(`Waiting for block #${number}...`)
        return wait(6000).then(() => getBlock(number))
      }
      $logger.error({ number }, 'getBlock', e)
      process.exit(-2)
    })

    if (block) {
      return block
    }
    $logger.info(`Waiting for block #${number}...`)
    await wait(6000)
    return getBlock(number)
  }

  const getRuntimeWindow = (windowId) => {
    return RuntimeWindow.findOne({ windowId }).catch((e) => {
      if (e.message === 'path exists') {
        $logger.warn('Index not found, retrying in 10s...')
        return wait(10000).then(() => getRuntimeWindow(windowId))
      }
      if (e.message === 'document not found') {
        return null
      }
      $logger.error({ windowId }, 'getRuntimeWindow', e)
      process.exit(-2)
    })
  }

  const doComputeWindow = async ({ id, previousWindow }) => {
    let currentWindow = await getRuntimeWindow(id)

    if (currentWindow && currentWindow.finished) {
      $logger.info(`Window #${id} found in cache.`)
      latestWindowId = id
      return doComputeWindow({ id: id + 1, previousWindow: currentWindow })
    }

    const doProcessBlock = async ({ number, previousBlock }) => {
      const block = await getBlock(number)
      const setId = block.setId

      if (!previousBlock) {
        $logger.info(`Starting new window #${id} at block #${number}...`)
        console.log(`Starting new window #${id} at block #${number}...`)

        currentWindow._applyData({
          currentBlock: number,
          setId,
        })

        await currentWindow.save()
        await wait(1)
        return doProcessBlock({ number: number + 1, previousBlock: block })
      }

      const prevSetId = previousBlock.setId

      if (setId === prevSetId) {
        currentWindow._applyData({ currentBlock: number })

        await currentWindow.save()
        await wait(1)
        return doProcessBlock({ number: number + 1, previousBlock: block })
      }

      currentWindow._applyData({
        currentBlock: number,
        stopBlock: number,
        finished: true,
      })
      await currentWindow.save()
      await wait(1)
      $logger.info(`Ending window #${id} at block #${number}...`)
    }

    if (currentWindow) {
      const previousBlockNumber = currentWindow.currentBlock

      await doProcessBlock({
        number: previousBlockNumber + 1,
        previousBlock:
          previousBlockNumber > -1 ? await getBlock(previousBlockNumber) : null,
      })
    } else {
      let startBlockNumber = 0
      if (id > 0) {
        startBlockNumber =
          (previousWindow || (await getRuntimeWindow(id - 1))).stopBlock + 1
      }

      currentWindow = await RuntimeWindow.create({
        startBlock: startBlockNumber,
        stopBlock: -1,
        finished: false,
        currentBlock: -1,
        setId: -1,
        windowId: id,
      })
      await wait(1)

      await doProcessBlock({ number: startBlockNumber })
    }

    latestWindowId += 1

    return doComputeWindow({
      id: latestWindowId + 1,
      previousWindow: currentWindow,
    })
  }

  return doComputeWindow({
    id: latestWindowId + 1,
    previousWindow: null,
  })
}

export default computeWindow

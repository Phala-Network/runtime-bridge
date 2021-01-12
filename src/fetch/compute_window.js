import RuntimeWindow from '@/models/runtime_window'
import { APP_VERIFIED_WINDOW_ID } from '@/utils/constants'
import wait from '@/utils/wait'

const computeWindow = async ({ chainName, redis, BlockModel }) => {
  const CHAIN_APP_VERIFIED_WINDOW_ID = `${chainName}:${APP_VERIFIED_WINDOW_ID}`

  let latestWindowId = parseInt(await redis.get(CHAIN_APP_VERIFIED_WINDOW_ID) || 0) - 1

  const getBlock = number => {
    return BlockModel.load(`${number}`)
      .catch(async e => {
        if (!(e?.message === 'not found')) {
          $logger.error(e)
          process.exit(-2)
        }
        $logger.info(`Waiting for block #${number}...`)
        await wait(6000)
        return getBlock(number)
      })
  }

  const doComputeWindow = async ({ id, previousWindow }) => {
    let currentWindow

    try {
      currentWindow = await RuntimeWindow.load(`${id}`)
      if (currentWindow.property('finished')) {
        $logger.info(`Window #${id} found in cache.`)
        latestWindowId = id
        return doComputeWindow({ id: (id + 1), previousWindow: currentWindow })
      }
    } catch (e) {
      if (!(e?.message === 'not found')) {
        $logger.error(e)
        process.exit(-2)
      }
    }

    const doProcessBlock = async ({ number, previousBlock }) => {
      const block = await getBlock(number)
      const setId = block.property('setId')

      if (!previousBlock) {
        $logger.info(`Starting new window #${id} at block #${number}...`)
        console.log(`Starting new window #${id} at block #${number}...`)

        currentWindow.property({
          currentBlock: number,
          setId
        })

        await currentWindow.save()
        return doProcessBlock({ number: number + 1, previousBlock: block })
      }

      const prevSetId = previousBlock.property('setId')

      if (setId === prevSetId) {
        currentWindow.property({ currentBlock: number })

        await currentWindow.save()
        return doProcessBlock({ number: number + 1, previousBlock: block })
      }

      currentWindow.property({
        currentBlock: number,
        stopBlock: number,
        finished: true
      })
      await currentWindow.save()
      $logger.info(`Ending window #${id} at block #${number}...`)
    }

    if (currentWindow) {
      const previousBlockNumber = currentWindow.property('currentBlock')

      await doProcessBlock({
        number: previousBlockNumber + 1,
        previousBlock: (previousBlockNumber > -1) ? (await BlockModel.load(`${previousBlockNumber}`)) : null
      })
    } else {
      let startBlockNumber = 0
      if (id > 0) {
        startBlockNumber = (previousWindow || (await RuntimeWindow.load(`${id - 1}`)))
          .property('stopBlock') + 1
      }

      currentWindow = new RuntimeWindow()
      currentWindow.id = `${id}`
      currentWindow.property({
        startBlock: startBlockNumber,
        stopBlock: -1,
        finished: false,
        currentBlock: -1,
        setId: -1
      })
      await currentWindow.save()
      await doProcessBlock({ number: startBlockNumber })
    }

    latestWindowId += 1

    return doComputeWindow({
      id: latestWindowId + 1,
      previousWindow: currentWindow
    })
  }

  return doComputeWindow({
    id: latestWindowId + 1,
    previousWindow: null
  })
}

export default computeWindow

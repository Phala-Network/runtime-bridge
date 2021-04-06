
import { APP_VERIFIED_WINDOW_ID, APP_RECEIVED_HEIGHT, SYNC_HEADER_REQ_EMPTY, DISPATCH_BLOCK_REQ_EMPTY } from '@/utils/constants'
import wait from '@/utils/wait'
import { bytesToBase64 } from 'byte-base64'
import { getModel, start } from 'ottoman'

const organizeBlob = async ({ api, chainName, redis, BlockModel, initHeight }) => {
  const RuntimeWindow = getModel('RuntimeWindow')
  const OrganizedBlob = getModel('OrganizedBlob')

  let shouldFulfill = true
  let blobNumber = 0

  $logger.info('Removing unfulfilled blobs...')
  try {
    const removeResult = await OrganizedBlob.removeMany({ fullBlob: false })
    $logger.info('Removed unfulfilled blobs...', { removeResult })
  } catch (e) {
    if (e.message === 'path exists') {
      $logger.warn('Index not found, skip removing...')
    } else {
      throw e
    }
  }

  const getWindow = async (windowId) => {
    const window = await RuntimeWindow.findOne({ windowId })
      .catch(e => {
        if (e.message === 'path exists') {
          $logger.warn('Index not found, retrying in 10s...')
          return wait(10000).then(() => getWindow(windowId))
        }
        $logger.error('getWindow', e, { windowId })
        process.exit(-2)
      })
    if (window) { return window }
    await wait(6000)
    return getWindow(windowId)
  }

  const CHAIN_APP_VERIFIED_WINDOW_ID = `${chainName}:${APP_VERIFIED_WINDOW_ID}`
  const CHAIN_APP_RECEIVED_HEIGHT = `${chainName}:${APP_RECEIVED_HEIGHT}`

  const eventsStorageKey = api.query.system.events.key()

  let latestWindowId = -1

  const getBlock = async number => {
    const block = await BlockModel.findOne({ number })
      .catch(e => {
        if (e.message === 'path exists') {
          $logger.warn('Index not found, retrying in 10s...')
          return wait(10000).then(() => getBlock(number))
        }
        $logger.error('getBlock', e, { number })
        process.exit(-2)
      })
    if (!block) {
      shouldFulfill = false
      $logger.info(`Waiting for block #${number}...`)
      await wait(6000)
      return getBlock(number)
    }
    return block
  }

  const setLatestWindowId = id => {
    latestWindowId = id
    return redis.set(CHAIN_APP_VERIFIED_WINDOW_ID, id)
  }

  const saveBlob = async ({ windowId, startBlock, stopBlock, syncHeaderData, dispatchBlockData, genesisInfoData }) => {
    let blob

    if (shouldFulfill) {
      blob = await OrganizedBlob.findOne({ startBlock, stopBlock })

      if (
        blob.fullBlob &&
        (blob.windowId === windowId) &&
        (blob.number === blobNumber)
      ) {
        $logger.info(`Fulfilled blob found in window #${windowId} from block #${startBlock} to #${stopBlock}.`)
        blobNumber += 1
        return
      }
    }

    if (!blob) {
      blob = new OrganizedBlob()
    }

    blob._applyData({
      windowId,
      startBlock,
      stopBlock,
      fullBlob: shouldFulfill,
      number: blobNumber
    })

    if (syncHeaderData) {
      syncHeaderData.headers_b64 = syncHeaderData.headers.map(i => bytesToBase64(i.toU8a()))
      if (syncHeaderData.authoritySetChange) {
        syncHeaderData.authority_set_change_b64 = bytesToBase64(syncHeaderData.authoritySetChange.toU8a())
      }
      delete syncHeaderData.headers
      delete syncHeaderData.authoritySetChange
      blob._applyData({
        syncHeaderBlob: JSON.stringify(syncHeaderData)
      })
    }

    if (dispatchBlockData) {
      dispatchBlockData.blocks_b64 = dispatchBlockData.blocks.map(i => bytesToBase64(i.toU8a()))
      delete dispatchBlockData.blocks
      blob._applyData({
        dispatchBlockBlob: JSON.stringify(dispatchBlockData)
      })
    }

    if (genesisInfoData) {
      blob._applyData({
        genesisInfoBlob: JSON.stringify({
          skip_ra: false,
          bridge_genesis_info_b64: bytesToBase64(genesisInfoData.toU8a())
        })
      })
    }

    await blob.save()
    $logger.info({ windowId, startBlock, stopBlock, shouldFulfill }, 'Blob saved')
    blobNumber += 1

    return blob.number
  }

  const processWindow = async id => {
    let windowInfo = await getWindow(id)
    const { startBlock } = windowInfo

    if (!windowInfo.finished) {
      if ((parseInt(initHeight) - startBlock) < 3600) {
        shouldFulfill = false
      }
    }

    let { stopBlock } = windowInfo
    let currentBlock = startBlock

    const prepareBlob = async () => {
      const blobStartBlock = currentBlock

      const generateGenesisBlob = async () => {
        const blockData = await getBlock(currentBlock)
        const {
          header,
          grandpaAuthorities: validators,
          grandpaAuthoritiesStorageProof: validatorsProof
        } = blockData
        const genesisInfo = api.createType('ReqGenesisInfo', {
          header,
          validators: api.createType('VersionedAuthorityList', validators).authorityList,
          proof: validatorsProof
        })

        await saveBlob({
          windowId: id,
          startBlock: blobStartBlock,
          stopBlock: currentBlock,
          genesisInfoData: genesisInfo,
        })

        $logger.info('Generated blob for genesis block.')
        currentBlock += 1
        return prepareBlob()
      }

      const generateBlob = async ({ previousBlockData, syncHeaderData, dispatchBlockData }) => {
        const blockData = await getBlock(currentBlock)
        const _previousBlockData = previousBlockData || (await getBlock(currentBlock - 1))
        const {
          header,
          justification,
          events,
          eventsStorageProof,
          setId,
          grandpaAuthoritiesStorageProof
        } = blockData
        const hasJustification = justification && (justification.length > 2)

        syncHeaderData.headers.push(api.createType('ReqHeaderToSync', {
          header,
          justification,
          events,
          eventsStorageProof
        }))
        dispatchBlockData.blocks.push(api.createType('ReqBlockHeaderWithEvents', {
          blockHeader: header,
          events,
          proof: eventsStorageProof,
          key: eventsStorageKey
        }))

        if (hasJustification) {
          if (setId > _previousBlockData.setId) {
            syncHeaderData.authoritySetChange = api.createType('AuthoritySetChange', {
              authoritySet: {
                authoritySet: api.createType('VersionedAuthorityList', blockData.grandpaAuthorities).authorityList,
                setId
              },
              authorityProof: grandpaAuthoritiesStorageProof
            })
            ;({ stopBlock } = await getWindow(id))
            await saveBlob({
              windowId: id,
              startBlock: blobStartBlock,
              stopBlock: currentBlock,
              syncHeaderData,
              dispatchBlockData
            })
          } else {
            if (
              (syncHeaderData.headers.length >= 1000) ||
              ((parseInt(initHeight) - currentBlock) < 100)
            ) {
              await saveBlob({
                windowId: id,
                startBlock: blobStartBlock,
                stopBlock: currentBlock,
                syncHeaderData,
                dispatchBlockData
              })
            } else {
              currentBlock += 1
              return generateBlob({
                previousBlockData: blockData,
                syncHeaderData,
                dispatchBlockData
              })
            }
          }

          if (currentBlock === stopBlock) {
            await setLatestWindowId(id)
            return processWindow(latestWindowId + 1)
          }

          currentBlock += 1
          return prepareBlob()
        }

        currentBlock += 1
        return generateBlob({
          previousBlockData: blockData,
          syncHeaderData,
          dispatchBlockData
        })
      }

      const _prepareBlob = () => {
        if ((id === 0) && (currentBlock === 0)) {
          return generateGenesisBlob()
        }

        return generateBlob({
          syncHeaderData: {
            ...SYNC_HEADER_REQ_EMPTY,
            headers: [],
            headers_b64: []
          },
          dispatchBlockData: {
            ...DISPATCH_BLOCK_REQ_EMPTY,
            blocks: [],
            blocks_b64: []
          }
        })
      }

      return _prepareBlob()
    }

    return prepareBlob()
  }

  try {
    const lastBlob = await OrganizedBlob.findOne({}, { sort: { number: 'DESC', windowId: 'DESC' } })
    const lastWindow = lastBlob.windowId
    const lastNumber = (await OrganizedBlob.findOne({ windowId: lastWindow - 1 }, { sort: { number: 'DESC' } })).number

    blobNumber = lastNumber + 1
    latestWindowId = lastWindow - 1
    // todo: check behavior when having sufficient data
  } catch (error) {
    $logger.info('Failed to continue from the fulfilling point.')
    $logger.debug(error)
    latestWindowId = -1
    blobNumber = 0
  } finally {
    if (latestWindowId <= -1) {
      latestWindowId = -1
      blobNumber = 0
    }
    $logger.info({ latestWindowId, blobNumber }, 'Starting processing windows...')
    return processWindow(latestWindowId + 1)
  }
}

export default organizeBlob


import { APP_VERIFIED_WINDOW_ID, APP_RECEIVED_HEIGHT, APP_LATEST_BLOB_ID, SYNC_HEADER_REQ_EMPTY, DISPATCH_BLOCK_REQ_EMPTY } from '@/utils/constants'
import wait from '@/utils/wait'
import { bytesToBase64 } from 'byte-base64'
import { getModel } from 'ottoman'

const organizeBlob = async ({ api, chainName, redis, BlockModel, initHeight }) => {
  const RuntimeWindow = getModel('RuntimeWindow')
  const OrganizedBlob = getModel('OrganizedBlob')

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

  const saveBlob = async ({ windowId, startBlock, stopBlock, syncHeaderData, dispatchBlockData, genesisInfoData, fullBlob = false }) => {
    const blob = new OrganizedBlob({ windowId, startBlock, stopBlock, fullBlob })

    if (syncHeaderData) {
      syncHeaderData.headers_b64 = syncHeaderData.headers.map(i => bytesToBase64(i.toU8a()))
      if (syncHeaderData.authoritySetChange) {
        syncHeaderData.authority_set_change_b64 = bytesToBase64(syncHeaderData.authoritySetChange.toU8a())
      }
      delete syncHeaderData.headers
      delete syncHeaderData.authoritySetChange
      blob.syncHeaderBlob = JSON.stringify(syncHeaderData)
    }

    if (dispatchBlockData) {
      dispatchBlockData.blocks_b64 = dispatchBlockData.blocks.map(i => bytesToBase64(i.toU8a()))
      delete dispatchBlockData.blocks
      blob.dispatchBlockBlob = JSON.stringify(dispatchBlockData)
    }

    if (genesisInfoData) {
      blob.genesisInfoBlob = JSON.stringify({
        skip_ra: false,
        bridge_genesis_info_b64: bytesToBase64(genesisInfoData.toU8a())
      })
    }

    $logger.info(`Generated blob in window #${windowId} from block #${startBlock} to #${stopBlock}.`)

    await blob.save()
  }

  const processWindow = async id => {
    let windowInfo = await getWindow(id)
    const { startBlock } = windowInfo
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
          fullBlob: true
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
            await wait(1000)
            ;({ startBlock, stopBlock } = await getWindow(id))
            ;console.log({
              startBlock, stopBlock,
              blobStartBlock,
              currentBlock
            });
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
              ((initHeight - currentBlock) < 100)
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

  return processWindow(latestWindowId + 1)
}

export default organizeBlob

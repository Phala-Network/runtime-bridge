import OrganizedBlob from '@/models/organized_blob'
import RuntimeWindow from '@/models/runtime_window'
import { APP_VERIFIED_WINDOW_ID, APP_RECEIVED_HEIGHT, APP_LATEST_BLOB_ID, SYNC_HEADER_REQ_EMPTY, DISPATCH_BLOCK_REQ_EMPTY } from '@/utils/constants'
import wait from '@/utils/wait'
import { bytesToBase64, base64ToBytes } from 'byte-base64'

const getWindow = id => {
  return RuntimeWindow.load(`${id}`)
    .catch(async e => {
      if (!(e?.message === 'not found')) {
        $logger.error(e)
        process.exit(-2)
      }
      await wait(1000)
      return getWindow(id)
    })
}

const getBlob = id => {
  return OrganizedBlob.load(`${id}`)
    .catch(async e => {
      if (!(e?.message === 'not found')) {
        $logger.error(e)
        process.exit(-2)
      }
      throw e
    })
}

const organizeBlob = async ({ api, chainName, redis, BlockModel }) => {
  const oldBlobs = await redis.keys('*OrganizedBlob*')
  await Promise.all(oldBlobs.map(i => redis.del(i)))

  const CHAIN_APP_VERIFIED_WINDOW_ID = `${chainName}:${APP_VERIFIED_WINDOW_ID}`
  const CHAIN_APP_LATEST_BLOB_ID = `${chainName}:${APP_LATEST_BLOB_ID}`
  const CHAIN_APP_RECEIVED_HEIGHT = `${chainName}:${APP_RECEIVED_HEIGHT}`

  const eventsStorageKey = api.query.system.events.key()

  let latestWindowId = -1
  let latestBlobId = -1

  const getBlock = number => {
    return BlockModel.load(`${number}`)
      .catch(async e => {
        if (!(e?.message === 'not found')) {
          $logger.error(e)
          process.exit(-2)
        }
        await wait(1000)
        return getBlock(number)
      })
  }
  const getWindowInfo = async id => (await getWindow(id)).allProperties()
	
	const setLatestWindowId = id => {
		latestWindowId = id
		return redis.set(CHAIN_APP_VERIFIED_WINDOW_ID, id)
	}
  const setBlobId = id => {
		latestBlobId = id
		return redis.set(CHAIN_APP_LATEST_BLOB_ID, id)
	}

  const saveBlob = async ({ windowId, startBlock, stopBlock, syncHeaderData, dispatchBlockData, genesisInfoData }) => {
    const targetBlobId = latestBlobId + 1
    const blob = new OrganizedBlob()
    blob.id = `${targetBlobId}`

    blob.property({ windowId, startBlock, stopBlock })

    if (syncHeaderData) {
      syncHeaderData.headers_b64 = syncHeaderData.headers.map(i => bytesToBase64(i.toU8a()))
      if (syncHeaderData.authoritySetChange) {
        syncHeaderData.authority_set_change_b64 = bytesToBase64(syncHeaderData.authoritySetChange.toU8a())
      }
      delete syncHeaderData.headers
      delete syncHeaderData.authoritySetChange
      blob.property('syncHeaderBlob', JSON.stringify(syncHeaderData))
    }

    if (dispatchBlockData) {
      dispatchBlockData.blocks_b64 = dispatchBlockData.blocks.map(i => bytesToBase64(i.toU8a()))
      delete dispatchBlockData.blocks
      blob.property('dispatchBlockBlob', JSON.stringify(dispatchBlockData))
    }

    if (genesisInfoData) {
      blob.property('genesisInfoBlob', JSON.stringify({
        skip_ra: false,
        bridge_genesis_info_b64: bytesToBase64(genesisInfoData.toU8a())
      }))
    }
    
    $logger.info(`Generated blob #${targetBlobId} from block #${startBlock} to #${stopBlock} in window #${windowId}.`)

    await blob.save()
    await setBlobId(targetBlobId)
  }

  const processWindow = async id => {
    let windowInfo = await getWindowInfo(id)
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
        } = blockData.allProperties()
        const genesisInfo = api.createType('ReqGenesisInfo', {
          header,
          validators: api.createType('VersionedAuthorityList', validators).authorityList,
          proof: validatorsProof
        })
  
        await saveBlob({
          windowId: id,
          startBlock: blobStartBlock,
          stopBlock: currentBlock,
          genesisInfoData: genesisInfo
        })
  
        $logger.info('Generated blob for genesis block.')
        currentBlock += 1
        return prepareBlob()
      }
  
      const generateBlob = async ({ previousBlockData, syncHeaderData, dispatchBlockData }) => {
        const blockData = await getBlock(currentBlock)
        const _previousBlockData = previousBlockData || (await getBlock(currentBlock - 1))
        const { header, justification, events, eventsStorageProof } = blockData.allProperties()
        const hasJustification = justification.length > 2

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
          if ((blockData.property('setId') > _previousBlockData.property('setId'))) {
            syncHeaderData.authoritySetChange = api.createType('AuthoritySetChange', {
              authoritySet: {
                authoritySet: api.createType('VersionedAuthorityList', blockData.property('grandpaAuthorities')).authorityList,
                setId: blockData.property('setId')
              },
              authorityProof: blockData.property('grandpaAuthoritiesStorageProof')
            })
            await wait(1000)
            ;({ stopBlock } = await getWindowInfo(id))
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
              ((parseInt(await $redis.get(CHAIN_APP_RECEIVED_HEIGHT)) - currentBlock) < 100)
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

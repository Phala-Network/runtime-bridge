import { GRANDPA_AUTHORITIES_KEY } from '../utils/constants'
import { createHash } from 'crypto'
import { getGenesis, setGenesis } from '../io/block'
import {
  parentApi,
  phalaApi,
  setupParentApi,
  setupPhalaApi,
} from '../utils/api'
import { prb } from '@phala/runtime-bridge-walkie'
import env from '../utils/env'
import logger from '../utils/logger'
import setupPtp from './ptp'
import type {
  AuthorityList,
  ParaId,
  PersistedValidationData,
  StorageData,
} from '@polkadot/types/interfaces'
import type { Option } from '@polkadot/types'

const _processGenesis = async (paraId: number) => {
  const paraNumber = 0
  const parentNumber =
    ((
      (await phalaApi.query.parachainSystem.validationData.at(
        await phalaApi.rpc.chain.getBlockHash(paraNumber + 1)
      )) as Option<PersistedValidationData>
    )
      .unwrapOrDefault()
      .relayParentNumber.toJSON() as number) - 1

  const parentHash = await parentApi.rpc.chain.getBlockHash(parentNumber)
  const parentBlock = await parentApi.rpc.chain.getBlock(parentHash)
  const parentHeader = parentBlock.block.header

  const setIdKey = parentApi.query.grandpa.currentSetId.key()
  const setId = await parentApi.query.grandpa.currentSetId.at(parentHash)

  const grandpaAuthorities = parentApi.createType(
    'VersionedAuthorityList',
    (
      (await parentApi.rpc.state.getStorage(
        GRANDPA_AUTHORITIES_KEY,
        parentHash
      )) as Option<StorageData>
    ).value
  )
  const grandpaAuthoritiesStorageProof = (
    await parentApi.rpc.state.getReadProof(
      [GRANDPA_AUTHORITIES_KEY, setIdKey],
      parentHash
    )
  ).proof

  const bridgeGenesisInfo = Buffer.from(
    parentApi
      .createType('GenesisInfo', {
        header: parentHeader,
        authoritySet: {
          authoritySet: (
            grandpaAuthorities as unknown as { authorityList: AuthorityList }
          ).authorityList,
          setId,
        },
        proof: grandpaAuthoritiesStorageProof,
      })
      .toU8a()
  )

  const genesisState = Buffer.from(
    (
      await phalaApi.rpc.state.getPairs(
        '',
        await phalaApi.rpc.chain.getBlockHash(paraNumber)
      )
    ).toU8a()
  )

  return {
    paraId,
    paraNumber,
    parentNumber,
    bridgeGenesisInfo,
    genesisState,
  }
}

const processGenesis = async () => {
  const paraId = (
    (await phalaApi.query.parachainInfo.parachainId()) as ParaId
  ).toNumber()
  let genesis = await getGenesis(paraId)
  if (!genesis) {
    logger.info('Fetching genesis...')
    genesis = await setGenesis(await _processGenesis(paraId))
  } else {
    logger.info('Got genesis in cache.')
  }
  return genesis
}

const start = async () => {
  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)

  const genesis = await processGenesis()
  const _genesisHash = createHash('sha256')
  _genesisHash.update(genesis.bridgeGenesisInfo as Buffer)
  const genesisHash = _genesisHash.digest('hex')
  await setupPtp(genesisHash)
  console.log(prb.data_provider)
}

export default start

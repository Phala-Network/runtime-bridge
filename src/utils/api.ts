import { ApiPromise, HttpProvider, WsProvider } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'
import { PHALA_SS58_FORMAT } from './constants'
// import { khala } from '@phala/typedefs'
import { typesChain as phalaTypesChain } from '@phala/typedefs'
import logger from './logger'
import phalaTypes from './typedefs'
import typesBundle from '@polkadot/apps-config/api/typesBundle'
import type { Decorate } from '@polkadot/api/base/Decorate'
// import type { OverrideBundleType } from '@polkadot/types/types'

export type PossibleApiPromise = ApiPromise | undefined

let _phalaApi: PossibleApiPromise, _parentApi: PossibleApiPromise

export const keyring = new Keyring({
  type: 'sr25519',
  ss58Format: PHALA_SS58_FORMAT,
})

// const typesBundle = {
//   spec: {
//     khala,
//   },
// }

const rpc = {
  pha: {
    getStorageChangesAt: {
      description: 'Return the storage changes made by each block one by one',
      params: [
        {
          name: 'blockHash',
          type: 'Hash',
        },
      ],
      type: 'Vec<StorageChanges>',
    },
    getMqNextSequence: {
      description:
        'Return the next mq sequence number for given sender which take the ready transactions in txpool in count.',
      params: [
        {
          name: 'senderHex',
          type: 'string', // hex string of scale-encoded `MessageOrigin`
        },
      ],
      type: 'u64',
    },
  },
}

const setupPhalaApi = async (
  endpoint: string,
  useHttp = false,
  forceRecreate = false
) => {
  if (!forceRecreate && !!_phalaApi) {
    throw new Error('Phala API already created!')
  }

  const phalaProvider = new (useHttp ? HttpProvider : WsProvider)(endpoint)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
    typesChain: {
      // ...typesChain,
      ...phalaTypesChain,
    },
    // typesBundle: typesBundle as OverrideBundleType,
    rpc,
  })

  phalaApi.on('disconnected', (e) => {
    logger.info(e)
    if (_phalaApi === phalaApi) {
      process.exit(255)
    }
  })

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (
    await Promise.all([
      phalaApi.rpc.system.chain(),
      phalaApi.rpc.system.name(),
      phalaApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  logger.info(
    { chain: phalaChain },
    `Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`
  )

  Object.assign(phalaApi, {
    phalaChain,
    phalaNodeName,
    phalaNodeVersion,
    eventsStorageKey: phalaApi.query.system.events.key(),
  })

  _phalaApi = phalaApi

  return phalaApi
}

const setupParentApi = async (endpoint: string, forceRecreate = false) => {
  if (!forceRecreate && !!_parentApi) {
    throw new Error('Parent API already created!')
  }

  const parentProvider = new WsProvider(endpoint)
  const parentApi = await ApiPromise.create({
    provider: parentProvider,
    types: phalaTypes,
    rpc,
  })

  parentApi.on('disconnected', (e) => {
    logger.info(e)
    if (_parentApi === parentApi) {
      process.exit(255)
    }
  })

  const [parentChain, parentNodeName, parentNodeVersion] = (
    await Promise.all([
      parentApi.rpc.system.chain(),
      parentApi.rpc.system.name(),
      parentApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  logger.info(
    { chain: parentChain },
    `Connected to chain ${parentChain} using ${parentNodeName} v${parentNodeVersion}`
  )

  Object.assign(parentApi, {
    parentChain,
    parentNodeName,
    parentNodeVersion,
    eventsStorageKey: parentApi.query.system.events.key(),
  })

  _parentApi = parentApi

  return parentApi
}

export type MonkeyApiPromise = ApiPromise & {
  _rpcCore: Decorate<never>['_rpcCore']
}

export {
  typesBundle,
  // typesChain,
  setupPhalaApi,
  setupParentApi,
  _phalaApi as phalaApi,
  _parentApi as parentApi,
}

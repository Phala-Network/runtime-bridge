import { ApiPromise, WsProvider } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'
import { PHALA_SS58_FORMAT } from './constants'
import { typesChain as phalaTypesChain } from '@phala/typedefs'
import phalaTypes from './typedefs'
import spec from '@polkadot/apps-config/api/spec/phala'
import typesChain from '@polkadot/apps-config/api/chain'

let _phalaApi, _parentApi

export const keyring = new Keyring({
  type: 'sr25519',
  ss58Format: PHALA_SS58_FORMAT,
})

const typesBundle = {
  spec: {
    'phala-node': spec,
    'phale-node': spec,
  },
}

const rpc = {
  pha: {
    getStorageChanges: {
      description: 'Return the storage changes made by each block one by one',
      params: [
        {
          name: 'from',
          type: 'Hash',
        },
        {
          name: 'to',
          type: 'Hash',
        },
      ],
      type: 'Vec<StorageChanges>',
    },
  },
}

const setupPhalaApi = async (endpoint, forceRecreate = false) => {
  if (!forceRecreate && !!_phalaApi) {
    throw new Error('Phala API already created!')
  }

  const phalaProvider = new WsProvider(endpoint)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
    typesChain: {
      ...typesChain,
      ...phalaTypesChain,
    },
    typesBundle: { spec },
    rpc,
  })

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (
    await Promise.all([
      phalaApi.rpc.system.chain(),
      phalaApi.rpc.system.name(),
      phalaApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  $logger.info(
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

const setupParentApi = async (endpoint, forceRecreate = false) => {
  if (!forceRecreate && !!_parentApi) {
    throw new Error('Parent API already created!')
  }

  const phalaProvider = new WsProvider(endpoint)
  const parentApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
    typesChain: {
      ...typesChain,
      ...phalaTypesChain,
    },
    typesBundle: { spec },
    rpc,
  })

  const [parentChain, parentNodeName, parentNodeVersion] = (
    await Promise.all([
      parentApi.rpc.system.chain(),
      parentApi.rpc.system.name(),
      parentApi.rpc.system.version(),
    ])
  ).map((i) => i.toString())

  $logger.info(
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

export {
  typesBundle,
  typesChain,
  setupPhalaApi,
  setupParentApi,
  _phalaApi as phalaApi,
  _parentApi as parentApi,
}

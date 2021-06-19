import { ApiPromise, WsProvider } from '@polkadot/api'
import { typesChain as phalaTypesChain } from '@phala/typedefs'
import phalaTypes from './typedefs'
import spec from '@polkadot/apps-config/api/spec/phala'
import typesChain from '@polkadot/apps-config/api/chain'

let _phalaApi
export const getPhalaApi = () => _phalaApi

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

  if (process.env.NODE_ENV === 'development') {
    globalThis.$phalaApi = phalaApi
  }
  return phalaApi
}

export { typesBundle, typesChain, setupPhalaApi, _phalaApi as phalaApi }

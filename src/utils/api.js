import { ApiPromise, WsProvider } from '@polkadot/api'
import phalaTypes from './typedefs'
import { typesChain as phalaTypesChain } from '@phala/typedefs'
import typesChain from '@polkadot/apps-config/api/chain'
import spec from '@polkadot/apps-config/api/spec/phala'

const typesBundle = {
  spec: {
    'phala-node': spec,
    'phale-node': spec,
  },
}

const createPhalaApi = async (endpoint) => {
  const phalaProvider = new WsProvider(endpoint)
  const phalaApi = await ApiPromise.create({
    provider: phalaProvider,
    types: phalaTypes,
    typesChain: {
      ...typesChain,
      ...phalaTypesChain,
    },
    typesBundle: { spec },
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
  })

  if (process.env.NODE_ENV === 'development') {
    globalThis.$phalaApi = phalaApi
  }
  return phalaApi
}

export { typesBundle, typesChain, createPhalaApi }

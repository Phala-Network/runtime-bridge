export const ENV_LIST = [
  ['NODE_ENV', 'nodeEnv'],
  ['PHALA_PARA_PARALLEL_BLOCKS', 'parallelParaBlocks'],
  ['PHALA_PARENT_PARALLEL_BLOCKS', 'parallelParentBlocks'],
  ['PHALA_LOGGER_LEVEL', 'loggerLevel'],
  ['PHALA_MODULE', 'moduleName'],
  ['PHALA_PARENT_CHAIN_ENDPOINT', 'parentChainEndpoint'],
  ['PHALA_CHAIN_ENDPOINT', 'chainEndpoint'],
  ['PHALA_Q_REDIS_ENDPOINT', 'qRedisEndpoint'],

  ['PHALA_HOLD_ON_SUBPROCESS_EXIT', 'holdOnSubprocessExit'],

  ['PHALA_PEER_ID_PREFIX', 'peerIdPrefix'],
  ['PHALA_WALKIE_LISTEN_ADDRESSES', 'walkieListenAddresses'],
  ['PHALA_WALKIE_BOOT_NODES', 'walkieBootNodes'],

  [
    'PHALA_DATA_PROVIDER_EXTERNAL_LISTEN_ADDRESSES',
    'dataProviderExternalListenAddress',
  ],
  ['PHALA_DATA_PROVIDER_TRUSTED_ORIGINS', 'dataProviderTrustedOrigins'],
  ['PHALA_DATA_PROVIDER_BOOT_NODES', 'dataProviderBootNodes'],

  ['PHALA_LOCAL_DB_PATH', 'localDbPath'],
  ['PHALA_DATA_PROVIDER_LOCAL_SERVER', 'dataProviderLocalServerPort'],

  [
    'PHALA_LIFECYCLE_BLOB_SERVER_SESSION_MAX_MEMORY',
    'blobServerSessionMaxMemory',
  ],
  ['PHALA_DATA_PROVIDER_BLOB_MAX_RANGE_COUNT', 'blobMaxRangeCount'],
  [
    'PHALA_DATA_PROVIDER_BLOB_MAX_PARA_BLOCK_RANGE_COUNT',
    'blobMaxParaBlockRangeCount',
  ],
] as const

type EnvPair = typeof ENV_LIST[number]
type EnvPairValue = EnvPair[0] | EnvPair[1]
type EnvObject = {
  [key in EnvPairValue]: string
}

const _env = {} as EnvObject

ENV_LIST.forEach((i) => {
  _env[i[1]] = process.env[i[0]]
  _env[i[0]] = process.env[i[0]]
})

export const env = Object.freeze(_env)
export const isDev = env.NODE_ENV === 'development'

export const walkieListenAddresses = (
  env.walkieListenAddresses ?? '/ip4/0.0.0.0/tcp/0,/ip6/::/tcp/0'
)
  .split(',')
  .map((i) => i.trim())
export const walkieBootNodes = env.walkieBootNodes
  ? env.walkieBootNodes.split(',').map((i) => i.trim())
  : walkieListenAddresses
export const peerIdPrefix = env.peerIdPrefix ?? '/var/data/keys/id'

export const dataProviderExternalListenAddress = (
  env.dataProviderExternalListenAddress ??
  '/ip4/0.0.0.0/tcp/18888,/ip6/::/tcp/28889'
)
  .split(',')
  .map((i) => i.trim())
export const dataProviderTrustedOrigins = env.dataProviderTrustedOrigins
  ? env.dataProviderTrustedOrigins.split(',').map((i) => i.trim())
  : []
export const dataProviderBootNodes = env.dataProviderBootNodes
  ? env.dataProviderBootNodes.split(',').map((i) => i.trim())
  : []

export const dataProviderLocalServerPort =
  parseInt(env.dataProviderLocalServerPort) || 8012

export const blobServerSessionMaxMemory =
  parseInt(env.blobServerSessionMaxMemory) || 64

export const holdOnSubprocessExit = env.holdOnSubprocessExit === 'true'

export default env

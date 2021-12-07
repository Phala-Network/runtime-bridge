export const ENV_LIST = [
  ['NODE_ENV', 'nodeEnv'],
  ['PHALA_PARA_PARALLEL_BLOCKS', 'parallelParaBlocks'],
  ['PHALA_PARENT_PARALLEL_BLOCKS', 'parallelParentBlocks'],
  ['PHALA_LOGGER_LEVEL', 'loggerLevel'],
  ['PHALA_MODULE', 'moduleName'],
  ['PHALA_DB_PREFIX', 'dbPrefix'],
  ['PHALA_PARENT_CHAIN_ENDPOINT', 'parentChainEndpoint'],
  ['PHALA_CHAIN_ENDPOINT', 'chainEndpoint'],
  ['PHALA_REDIS_ENDPOINT', 'redisEndpoint'],
  ['PHALA_Q_REDIS_ENDPOINT', 'qRedisEndpoint'],
  ['PHALA_DEV_SKIP_RA', 'devSkipRa'],

  ['PHALA_DB_ENDPOINT', 'dbEndpoint'],
  ['PHALA_DB_NAMESPACE', 'dbNamespace'],
  ['PHALA_DB_FETCH_NAMESPACE', 'dbFetchNamespace'],

  ['PHALA_ENABLE_KEEP_ALIVE', 'enableKeepAlive'],
  ['PHALA_KEEP_ALIVE_TIMEOUT', 'keepAliveTimeout'],
  ['PHALA_MIN_BENCH_SCORE', 'minBenchScore'],
  ['PHALA_ENFORCE_MIN_BENCH_SCORE', 'enforceMinBenchScore'],

  ['PHALA_LRU_CACHE_SIZE', 'lruCacheSize'],
  ['PHALA_LRU_CACHE_MAX_AGE', 'lruCacheMaxAge'],
  ['PHALA_LRU_CACHE_DBUG_LOG_INTERVAL', 'lruCacheDebugLogInterval'],

  ['PHALA_PEER_ID_PREFIX', 'peerIdPrefix'],
  ['PHALA_WALKIE_LISTEN_ADDRESSES', 'walkieListenAddresses'],
  ['PHALA_WALKIE_TRUSTED_DIALERS', 'walkieTrustedDialers'],

  [
    'PHALA_DATA_PROVIDER_EXTERNAL_LISTEN_ADDRESSES',
    'dataProviderExternalListenAddress',
  ],
  ['PHALA_DATA_PROVIDER_TRUSTED_ORIGINS', 'dataProviderTrustedOrigins'],
  ['PHALA_DATA_PROVIDER_BOOT_NODES', 'dataProviderBootNodes'],
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
export const shouldSkipRa = env.devSkipRa === 'true'
export const enableKeepAlive = env.enableKeepAlive
  ? env.enableKeepAlive === 'true'
  : false
export const keepAliveTimeout = env.keepAliveTimeout
  ? parseInt(env.keepAliveTimeout)
  : 60000
export const minBenchScore = parseInt(env.minBenchScore) || 50
export const enforceMinBenchScore = env.enforceMinBenchScore === 'true'

export const lruCacheSize = parseInt(env.lruCacheSize) || 5000
export const lruCacheMaxAge = parseInt(env.lruCacheMaxAge) || 30 * 60 * 1000
export const lruCacheDebugLogInterval =
  parseInt(env.lruCacheDebugLogInterval) || (isDev ? 3000 : 0)

export const walkieListenAddresses = (
  env.walkieListenAddresses ?? '/ip4/0.0.0.0/tcp/18888,/ip6/::/tcp/18888'
)
  .split(',')
  .map((i) => i.trim())
export const walkieTrustedDialers = env.walkieTrustedDialers
  ? env.walkieTrustedDialers.split(',').map((i) => i.trim())
  : []
export const peerIdPrefix = env.peerIdPrefix ?? '/var/data/keys/id'

export const dataProviderExternalListenAddress = (
  env.dataProviderExternalListenAddress ??
  '/ip4/0.0.0.0/tcp/28888,/ip6/::/tcp/28889'
)
  .split(',')
  .map((i) => i.trim())
export const dataProviderTrustedOrigins = env.dataProviderTrustedOrigins
  ? env.dataProviderTrustedOrigins.split(',').map((i) => i.trim())
  : []
export const dataProviderBootNodes = env.dataProviderTrustedOrigins
  ? env.dataProviderTrustedOrigins.split(',').map((i) => i.trim())
  : [
      '/ip4/10.96.89.143/tcp/28888/p2p/12D3KooWErcgYdvMKczb7UbuvKU5wCVd9H5ngbj2WDN8jiSRm2tC',
    ]

export default env

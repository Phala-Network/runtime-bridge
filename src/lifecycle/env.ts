import { isDev } from '../utils/env'

export const ENV_LIST = [
  ['PHALA_DEV_SKIP_RA', 'devSkipRa'],
  ['PHALA_MIN_BENCH_SCORE', 'minBenchScore'],
  ['PHALA_ENFORCE_MIN_BENCH_SCORE', 'enforceMinBenchScore'],

  ['PHALA_LRU_CACHE_SIZE', 'lruCacheSize'],
  ['PHALA_LRU_CACHE_MAX_AGE', 'lruCacheMaxAge'],
  ['PHALA_LRU_CACHE_DBUG_LOG_INTERVAL', 'lruCacheDebugLogInterval'],

  [
    'PHALA_DATA_PROVIDER_EXTERNAL_LISTEN_ADDRESSES',
    'dataProviderExternalListenAddress',
  ],
  ['PHALA_DATA_PROVIDER_TRUSTED_ORIGINS', 'dataProviderTrustedOrigins'],
  ['PHALA_DATA_PROVIDER_BOOT_NODES', 'dataProviderBootNodes'],

  ['PHALA_LOCAL_DB_PATH', 'localDbPath'],

  ['PHALA_RUNNER_MAX_WORKER_NUMBER', 'runnerMaxWorkerNumber'],
  ['PHALA_LIFECYCLE_CONFIG_MODE', 'configMode'],
  ['PHALA_LIFECYCLE_BLOB_QUEUE_SIZE', 'blobQueueSize'],

  ['PHALA_PRPC_REQUEST_TIMEOUT', 'rpcRequestTimeout'],
  ['PHALA_BLOB_REQUEST_TIMEOUT', 'blobRequestTimeout'],

  [
    'DEBUG_LIFECYCLE_ALLOW_BLOB_FROM_SYNCHING_STATE',
    'debugAllowBlobFromSynchingState',
  ],
  ['PHALA_SYNC_ONLY', 'syncOnly'],
  ['PRPC_QUEUE_SIZE', 'prpcQueueSize'],
  ['PRPC_SUBQUEUE_SIZE', 'prpcSubqueueSize'],
  ['DISABLE_LRU', 'disableLru'],
  ['USE_LEGACY_SYNC', 'useLegacySync'],

  ['WORKER_KEEPALIVE_ENABLED', 'workerKeepaliveEnabled'],
  ['WORKER_KEEPALIVE_TIMEOUT', 'workerKeepaliveTimeout'],

  ['USE_BUILT_IN_TRADER', 'useBuiltInTrader'],
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

export const shouldSkipRa = env.devSkipRa === 'true'

export const minBenchScore = parseInt(env.minBenchScore) || 50
export const enforceMinBenchScore = env.enforceMinBenchScore === 'true'

export const lruCacheSize = parseInt(env.lruCacheSize) || 5000
export const lruCacheMaxAge = parseInt(env.lruCacheMaxAge) || 30 * 60 * 1000
export const lruCacheDebugLogInterval =
  parseInt(env.lruCacheDebugLogInterval) || (isDev ? 3000 : 0)

export const runnerMaxWorkerNumber = parseInt(env.runnerMaxWorkerNumber) || 150
export const isConfigMode = env.configMode === 'true'

export const blobQueueSize = parseInt(env.blobQueueSize) || 36
export const debugAllowBlobFromSynchingState =
  env.debugAllowBlobFromSynchingState === 'true'

export const rpcRequestTimeout = parseInt(env.rpcRequestTimeout) || 8000
export const blobRequestTimeout = parseInt(env.blobRequestTimeout) || 60000
export const syncOnly = env.syncOnly === 'true'

export const prpcQueueSize = parseInt(env.prpcQueueSize) || 65535
export const prpcSubqueueSize = parseInt(env.prpcSubqueueSize) || 10
export const disableLru = env.disableLru === 'true'
export const useLegacySync = env.useLegacySync === 'true'

export const workerKeepaliveEnabled = env.workerKeepaliveEnabled === 'true'
export const workerKeepaliveTimeout =
  parseInt(env.workerKeepaliveTimeout) || 5000

export const useBuiltInTrader = env.useBuiltInTrader == 'true'

export default env

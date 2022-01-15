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

export const runnerMaxWorkerNumber = parseInt(env.runnerMaxWorkerNumber) || 27
export const isConfigMode = env.configMode === 'true'

export const blobQueueSize = parseInt(env.blobQueueSize) || 2

export default env

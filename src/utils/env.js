import LevelDOWN from 'leveldown'
import RocksDB from 'rocksdb'

export const ENV_LIST = [
  ['NODE_ENV', 'nodeEnv'],
  ['PHALA_PARALLEL_BLOCKS', 'parallelBlocks'],
  ['PHALA_LOGGER_LEVEL', 'loggerLevel'],
  ['PHALA_MODULE', 'moduleName'],
  ['PHALA_DB_PREFIX', 'dbPrefix'],
  ['PHALA_PARENT_CHAIN_ENDPOINT', 'parentChainEndpoint'],
  ['PHALA_CHAIN_ENDPOINT', 'chainEndpoint'],
  ['PHALA_REDIS_ENDPOINT', 'redisEndpoint'],
  ['PHALA_DEV_SKIP_RA', 'devSkipRa'],
  ['PHALA_DB_HOST', 'dbHost'],
  ['PHALA_DB_PORT_BASE', 'dbPortBase'],
  ['PHALA_DB_TYPE', 'dbType'],
  ['PHALA_ENABLE_KEEP_ALIVE', 'enableKeepAlive'],
  ['PHALA_KEEP_ALIVE_TIMEOUT', 'keepAliveTimeout'],
]

const _env = {}

ENV_LIST.forEach((i) => {
  _env[i[1]] = process.env[i[0]]
  _env[i[0]] = process.env[i[0]]
})

export const env = Object.freeze(_env)
export const isDev = env.NODE_ENV === 'development'
export const shouldSkipRa = env.devSkipRa === 'true'
export const httpKeepAliveEnabled = env.httpKeepAliveEnabled === 'true'
export const legacySystemMqEnabled = env.enableLegacySystemMq === 'true'
export const dbType = env.dbType === 'leveldb' ? LevelDOWN : RocksDB
export const enableKeepAlive = env.enableKeepAlive
  ? env.enableKeepAlive === 'true'
  : false
export const keepAliveTimeout = env.keepAliveTimeout
  ? parseInt(env.keepAliveTimeout)
  : 60000
export default env

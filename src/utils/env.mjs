export const ENV_LIST = [
  ['NODE_ENV', 'nodeEnv'],
  ['PHALA_PARALLEL_BLOCKS', 'parallelBlocks'],
  ['PHALA_LOGGER_LEVEL', 'loggerLevel'],
  ['PHALA_MODULE', 'moduleName'],
  ['PHALA_DB_PREFIX', 'dbPrefix'],
  ['PHALA_MAIN_CHAIN_ENDPOINT', 'mainChainEndpoint'],
  ['PHALA_CHAIN_ENDPOINT', 'chainEndpoint'],
]

const _env = {}

ENV_LIST.forEach((i) => {
  _env[i[1]] = process.env[i[0]]
  _env[i[0]] = process.env[i[0]]
})

export const env = Object.freeze(_env)
export const isDev = env.NODE_ENV === 'development'
export default env

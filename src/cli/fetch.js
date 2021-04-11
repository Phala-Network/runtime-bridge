import { cliParseInt } from './common'

const apply = (program) => {
  program
    .command('fetch')
    .alias('f')
    .description('start worker for fetching data from the chain')
    .requiredOption(
      '-r, --redis-endpoint <uri>',
      'Redis endpoint for non-critical data'
    )
    .requiredOption('-c, --couchbase-endpoint <uri>', 'Couchbase endpoint')
    .requiredOption(
      '-p, --phala-rpc <url>',
      'URL of Phala Blockchain WebSocket RPC'
    )
    // .option('-r, --rococo-rpc <url>', 'URL of Rococo Blockchain WebSocket RPC')
    .option(
      '-l --parallel-blocks <blocks>',
      'number of parallel fetching tasks',
      cliParseInt,
      5
    )
    .action(
      ({ phalaRpc, couchbaseEndpoint, parallelBlocks, redisEndpoint }) => {
        import('@/fetch')
          .then(({ default: start }) =>
            start({
              phalaRpc,
              couchbaseEndpoint,
              redisEndpoint,
              parallelBlocks,
            })
          )
          .catch((...e) => {
            $logger.error(...e)
            process.exit(-1)
          })
      }
    )
}

export default apply

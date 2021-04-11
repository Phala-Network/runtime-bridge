const apply = (program) => {
  program
    .command('lifecycle')
    .alias('l')
    .description('start pruntime lifecycle manager')
    .requiredOption(
      '-r, --redis-endpoint <uri>',
      'Redis endpoint for non-critical data'
    )
    .requiredOption('-c, --couchbase-endpoint <uri>', 'Couchbase endpoint')
    .requiredOption(
      '-p, --phala-rpc <url>',
      'URL of Phala Blockchain WebSocket RPC'
    )
    .action(({ redisEndpoint, couchbaseEndpoint }) => {
      import('@/lifecycle')
        .then(({ default: start }) =>
          start({ redisEndpoint, couchbaseEndpoint })
        )
        .catch((...e) => {
          $logger.error(...e)
          process.exit(-1)
        })
    })
}

export default apply

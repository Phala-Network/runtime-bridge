const apply = (program) => {
  program
    .command('trade')
    .alias('t')
    .description('start worker for signing and sending transactions')
    .requiredOption(
      '-r, --redis-endpoint <uri>',
      'Redis endpoint for non-critical data'
    )
    .requiredOption('-c, --couchbase-endpoint <uri>', 'Couchbase endpoint')
    .requiredOption(
      '-p, --phala-rpc <url>',
      'URL of Phala Blockchain WebSocket RPC'
    )
    .action(({ phalaRpc, couchbaseEndpoint, redisEndpoint }) => {
      import('@/trade')
        .then(({ default: start }) =>
          start({
            phalaRpc,
            couchbaseEndpoint,
            redisEndpoint,
          })
        )
        .catch((...e) => {
          $logger.error(...e)
          process.exit(-1)
        })
    })
}

export default apply

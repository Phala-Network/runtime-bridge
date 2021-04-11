const apply = (program) => {
  program
    .command('trade')
    .alias('t')
    .description('start worker for signing and sending transactions')
    .requiredOption(
      '-r, --redis-endpoint <uri>',
      'Redis endpoint for non-critical data'
    )
    .requiredOption(
      '-c, --critical-redis-endpoint <uri>',
      'Redis endpoint for critical data'
    )
    .requiredOption(
      '-m, --message-redis-endpoint <uri>',
      'Redis endpoint for internal messages'
    )
    .requiredOption(
      '-p, --phala-rpc <url>',
      'URL of Phala Blockchain WebSocket RPC'
    )
    .action(
      ({ messageRedisEndpoint, criticalRedisEndpoint, redisEndpoint }) => {
        import('@/trade')
          .then(({ default: start }) =>
            start({
              redisEndpoint,
              messageRedisEndpoint,
              criticalRedisEndpoint,
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

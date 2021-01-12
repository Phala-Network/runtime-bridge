const apply = program => {
  program
    .command('communicate')
    .alias('c')
    .description('start worker for communicating with TEE(pruntime)')
    .requiredOption('-r, --redis-endpoint <uri>', 'Redis endpoint for non-critical data')
    .requiredOption('-q, --message-redis-endpoint <uri>', 'Redis endpoint for internal messages')
    .action(({ messageRdisEndpoint, redisEndpoint }) => {
      import('@/communicate')
        .then(({ default: start }) => start({ redisEndpoint, messageRdisEndpoint }))
        .catch((...e) => {
          $logger.error(...e)
          process.exit(-1)
        })
    })
}

export default apply

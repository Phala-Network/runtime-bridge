const apply = program => {
  program
    .command('communicate')
    .alias('c')
    .description('start worker for communicating with TEE(pruntime)')
    .requiredOption('-r, --redis-endpoint <uri>', 'Redis endpoint for non-critical data')
    .requiredOption('-m, --message-redis-endpoint <uri>', 'Redis endpoint for internal messages')
    .requiredOption('-i, --identity <ss58Address, id, nickname>', 'Machine identity')
    .action(({ messageRedisEndpoint, redisEndpoint, identity }) => {
      import('@/communicate')
        .then(({ default: start }) => start({ redisEndpoint, messageRedisEndpoint, identity }))
        .catch((...e) => {
          $logger.error(...e)
          process.exit(-1)
        })
    })
}

export default apply

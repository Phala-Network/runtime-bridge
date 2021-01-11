import startTrade from '../trade'

const apply = program => {
  program
    .command('trade')
    .alias('t')
    .description('start worker for signing and sending transactions')
    .requiredOption('-c, --critical-redis-endpoint <uri>', 'Redis endpoint for critical data')
    .requiredOption('-m, --message-redis-endpoint <uri>', 'Redis endpoint for internal messages')
    .action(({ messageRedisEndpoint, criticalRedisEndpoint, parent: { redisEndpoint } }) => {
      startTrade({ redisEndpoint, messageRedisEndpoint, criticalRedisEndpoint }).catch((...e) => {
        $logger.error(...e)
        process.exit(-1)
      })
    })
}

export default apply

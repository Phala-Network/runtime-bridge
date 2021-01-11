import startCommunicate from '../communicate'

const apply = program => {
  program
    .command('communicate')
    .alias('c')
    .description('start worker for communicating with TEE(pruntime)')
    .requiredOption('-q, --message-redis-endpoint <uri>', 'Redis endpoint for internal messages')
    .action(({ messageRdisEndpoint, parent: { redisEndpoint } }) => {
      startCommunicate({ redisEndpoint, messageRdisEndpoint }).catch((...e) => {
        $logger.error(...e)
        process.exit(-1)
      })
    })
}

export default apply

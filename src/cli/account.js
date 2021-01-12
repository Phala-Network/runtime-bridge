const apply = program => {
  program
    .command('set_machine')
    .description('Add or edit a sr25519 account for a machine')
    .option('-n, --nickname <string>', 'Nickname for the machine')
    .requiredOption('-c, --critical-redis-endpoint <uri>', 'Redis endpoint for critical data')
    .requiredOption('-e, --pruntime-endpoint <uri>', 'HTTP endpoint of pRuntime')
    .requiredOption('-m, --controller-mnemonic <mnemonic>', 'Private key or mnemonic of the controller account')
    .action(({ nickname, criticalRedisEndpoint, pruntimeEndpoint, controllerMnemonic }) => {
      import('@/account/set_machine')
        .then(({ default: setMachine }) => setMachine({ nickname, criticalRedisEndpoint, pruntimeEndpoint, controllerMnemonic }))
        .catch((...e) => {
          $logger.error(...e)
          process.exit(-1)
        })

    })
}

export default apply

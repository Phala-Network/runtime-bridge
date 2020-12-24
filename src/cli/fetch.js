import startFetch from '../fetch'

const apply = program => {
  program
    .command('fetch')
    .alias('f')
    .description('start worker for fetching data from the chain.')
    .requiredOption('-p, --phala-rpc <url>', 'URL of Phala Blockchain WebSocket RPC')
    // .option('-r, --rococo-rpc <url>', 'URL of Rococo Blockchain WebSocket RPC')
    .action(({ phalaRpc, redisEndpoint }) => {
      startFetch({ phalaRpc, redisEndpoint }).catch((...e) => {
        console.error(...e)
        process.exit(-1)
      })
    })
}

export default apply

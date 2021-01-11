import startFetch from '../fetch'
import { cliParseInt } from './common'

const apply = program => {
  program
    .command('fetch')
    .alias('f')
    .description('start worker for fetching data from the chain')
    .requiredOption('-p, --phala-rpc <url>', 'URL of Phala Blockchain WebSocket RPC')
    // .option('-r, --rococo-rpc <url>', 'URL of Rococo Blockchain WebSocket RPC')
    .option('-l --parallel-blocks <blocks>', 'number of parallel fetching tasks', cliParseInt, 50)
    .action(({ phalaRpc, redisEndpoint, parallelBlocks }) => {
      startFetch({ phalaRpc, redisEndpoint, parallelBlocks }).catch((...e) => {
        console.error(...e)
        process.exit(-1)
      })
    })
}

export default apply

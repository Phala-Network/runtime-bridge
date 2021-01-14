import { ApiPromise, WsProvider } from '@polkadot/api'
import phalaTypes from '@/utils/typedefs.json'
import createRedisClient from '@/utils/redis'
import Machine from '@/models/machine'
import createMessageQueue from '@/utils/mq'
import * as actions from './actions'
import createKeyring from "@/utils/keyring"

const start = async ({ phalaRpc, redisEndpoint, messageRedisEndpoint, criticalRedisEndpoint }) => {
  const phalaProvider = new WsProvider(phalaRpc)
  const phalaApi = await ApiPromise.create({ provider: phalaProvider, types: phalaTypes })

  const keyring = await createKeyring()

  const [phalaChain, phalaNodeName, phalaNodeVersion] = (await Promise.all([
    phalaApi.rpc.system.chain(),
    phalaApi.rpc.system.name(),
    phalaApi.rpc.system.version()
  ])).map(i => i.toString())

  $logger.info({ chain: phalaChain }, `Connected to chain ${phalaChain} using ${phalaNodeName} v${phalaNodeVersion}`)

  const redis = await createRedisClient(redisEndpoint, true)
  const criticalRedis = await createRedisClient(criticalRedisEndpoint, false)
  Machine.prototype.client = criticalRedis
  const mq = createMessageQueue(messageRedisEndpoint)
  await mq.ready()
  $logger.info('Waiting for messages...')

  mq.process(async job => {
    $logger.info(job.data, `Processing job #${job.id}...`, )
    const actionFn = actions[job.data.action]

    try {
      const ret = await actionFn(job.data.payload, {
        redis,
        criticalRedis,
        mq,
        Machine,
        keyring,
        api: phalaApi
      })
      $logger.info(`Job #${job.id} finished.`)
      return ret
    } catch (e) {
      $logger.warn(e, `Job #${job.id} failed with error.`)
      throw e
    }
  })
}

export default start

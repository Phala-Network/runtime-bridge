import { MIN_SYNCHED_DISTANCE } from '../utils/constants'
import { fork } from './ipc'
import { phalaApi, setupParentApi, setupPhalaApi } from '../utils/api'
import { prb } from '@phala/runtime-bridge-walkie'
import { processGenesis } from './block'
import { setupDb } from './io/db'
import { setupInternalPtp } from './ptp_int'
import env from '../utils/env'

const start = async () => {
  await setupDb()
  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)

  const genesis = await processGenesis()
  const genesisHash = (await phalaApi.rpc.chain.getBlockHash(1)).toHex()

  const info: prb.data_provider.IInfo = {
    get status() {
      return info.paraTarget - info.paraProcessedHeight <
        MIN_SYNCHED_DISTANCE &&
        info.parentTarget - info.parentProcessedHeight < MIN_SYNCHED_DISTANCE
        ? prb.data_provider.Status.S_IDLE
        : prb.data_provider.Status.S_SYHCHING
    },
    paraId: genesis.paraId,
    parentStartHeader: genesis.parentNumber,
    parentTarget: -1,
    parentFetchedHeight: -1,
    parentProcessedHeight: -1,
    parentCommittedHeight: -1,
    paraTarget: -1,
    paraFetchedHeight: -1,
    paraProcessedHeight: -1,
    paraCommittedHeight: -1,
  }
  await setupInternalPtp(genesisHash, info)

  fork('fetch_block', genesis, info, {
    SYNC_TYPE: 'para',
  })
  fork('fetch_block', genesis, info, {
    SYNC_TYPE: 'parent',
  })
  fork('make_blob', genesis, info)
}

export default start

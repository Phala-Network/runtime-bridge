import { DB_BLOCK, setupDb } from './io/db'
import { MIN_SYNCHED_DISTANCE } from '../utils/constants'
import { createHash } from 'crypto'
import { fork } from './ipc'
import { prb } from '@phala/runtime-bridge-walkie'
import { processGenesis } from './block'
import { setupInternalPtp } from './ptp_int'
import { setupParentApi, setupPhalaApi } from '../utils/api'
import env from '../utils/env'
import logger from '../utils/logger'

const start = async () => {
  await setupDb(DB_BLOCK)
  await setupParentApi(env.parentChainEndpoint)
  await setupPhalaApi(env.chainEndpoint)

  const genesis = await processGenesis()
  const _genesisHash = createHash('sha256')
  _genesisHash.update(genesis.bridgeGenesisInfo as Buffer)
  const genesisHash = _genesisHash.digest('hex')
  logger.info('Genesis hash:', genesisHash)

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

  fork('fetch_block', genesis, info)
  fork('make_blob', genesis, info)
}

export default start

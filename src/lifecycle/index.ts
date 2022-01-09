import { LIFECYCLE, getMyId } from '../utils/my-id'
import { _processGenesis } from '../data_provider/block'
import { createHash } from 'crypto'
import { createRunnerManager } from './runner_manager'
import { isConfigMode } from './env'
import { phalaApi, setupParentApi, setupPhalaApi } from '../utils/api'
import { setupLocalDb } from './local_db'
import { setupPtp } from './ptp'
import env from '../utils/env'
import logger from '../utils/logger'
import type { RunnerManagerContext } from './runner_manager'
import type { Sequelize } from 'sequelize'
import type { U8 } from '@polkadot/types'
import type { WalkiePtpNode } from '@phala/runtime-bridge-walkie/src/ptp'
import type { prb } from '@phala/runtime-bridge-walkie'
import type PeerId from 'peer-id'

export type LifecycleManagerContext = {
  myId: PeerId
  localDb: Sequelize
  chainIdentity: string
  ptpNode?: WalkiePtpNode<prb.WalkieRoles.WR_LIFECYCLE_MANAGER>
  runnerManager?: RunnerManagerContext
}

const start = async () => {
  const myId = await getMyId(LIFECYCLE)
  const localDb = await setupLocalDb(myId)

  await setupPhalaApi(env.chainEndpoint)
  const genesisHash = (await phalaApi.rpc.chain.getBlockHash(1)).toHex()
  logger.info('Genesis hash:', genesisHash)

  const context: LifecycleManagerContext = {
    myId,
    localDb,
    chainIdentity: genesisHash,
  }

  context.ptpNode = await setupPtp(context)

  if (isConfigMode) {
    logger.info("Runners won't start since config mode enabled.")
  } else {
    context.runnerManager = await createRunnerManager(context)
  }
}

export default start

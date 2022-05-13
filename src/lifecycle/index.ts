import { LIFECYCLE, getMyId } from '../utils/my-id'
import { createRunnerManager } from './runner_manager'
import { isConfigMode, useBuiltInTrader } from './env'
import { phalaApi, setupPhalaApi } from '../utils/api'
import { setupLocalDb } from './local_db'
import { setupPtp } from './ptp'
import env from '../utils/env'
import fork from '../utils/fork'
import logger from '../utils/logger'
import startTrader from '../trade'
import type { RunnerManagerContext } from './runner_manager'
import type { Sequelize } from 'sequelize'
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
    const works = []
    works.push(
      (async () => {
        context.runnerManager = await createRunnerManager(context)
      })()
    )
    if (useBuiltInTrader) {
      works.push(startTrader())
      fork('arena', 'utils/arena')
    }
    await Promise.all(works)
  }
}

export default start

import { iterate } from './sync'
import { phalaApi } from '../../utils/api'
import logger from '../../utils/logger'
import wait from '../../utils/wait'

const TIMEOUT_WAIT_AFTER_FINISH = 3000
const TIMEOUT_WAIT_ON_ERROR = 3000

export const startSyncMessage = (runtime) => {
  const {
    workerContext: { pid, workerBrief, dispatchTx },
    rpcClient,
  } = runtime
  let synchedToTargetPromiseResolve, synchedToTargetPromiseReject
  let synchedToTargetPromiseFinished = false
  let shouldStop = false

  const synchedToTargetPromise = new Promise((resolve, reject) => {
    synchedToTargetPromiseResolve = resolve
    synchedToTargetPromiseReject = reject
  })
  runtime.stopSyncMessage = () => {
    shouldStop = true
    runtime.stopSyncMessage = null
    runtime.shouldStopUpdateInfo = true

    synchedToTargetPromiseFinished = true
    synchedToTargetPromiseReject(null)
  }

  iterate(
    MqEgressIterator,
    async (e, attempt, setShouldIgnoreError) => {
      logger.warn(
        { attempt, ...workerBrief },
        'Error while synching mq egress:',
        e
      )
      await wait(TIMEOUT_WAIT_ON_ERROR)
      setShouldIgnoreError()
    },
    async (e) => {
      logger.warn(
        workerBrief,
        'Final attempt failed  while synching mq egress:',
        e
      )
      runtime.stopSyncMessage?.()
      throw e
    }
  ).catch((e) => {
    logger.error(workerBrief, `Worker stopped due to error:`, e)
  })

  return () => synchedToTargetPromise

  async function* MqEgressIterator() {
    while (true) {
      if (shouldStop) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseReject(null)
        return
      }

      await wait(TIMEOUT_WAIT_AFTER_FINISH)
      yield doMqEgressSync
    }
  }

  async function doMqEgressSync() {
    const messages = phalaApi.createType(
      'EgressMessages',
      (await rpcClient.getEgressMessages({})).encodedMessages
    )
    const ret = []
    for (const m of messages) {
      const origin = m[0]
      const onChainSequence = (
        await phalaApi.query.phalaMq.offchainIngress(origin)
      ).unwrapOrDefault()
      const innerMessages = m[1]
      for (const _m of innerMessages) {
        if (_m.sequence.lt(onChainSequence)) {
          logger.debug(
            `${_m.sequence.toJSON()} has been submitted. Skipping...`
          )
        } else {
          ret.push(_m.toHex())
        }
      }
    }

    if (!ret.length) {
      if (!synchedToTargetPromiseFinished) {
        synchedToTargetPromiseFinished = true
        synchedToTargetPromiseResolve()
      }
      return
    }

    logger.debug(workerBrief, `Synching  ${ret.length} message(s).`)
    await dispatchTx({
      action: 'BATCH_SYNC_MQ_MESSAGE',
      payload: {
        pid,
        messages: ret,
      },
    })
  }
}

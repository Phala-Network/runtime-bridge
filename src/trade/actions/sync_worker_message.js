import { phalaApi } from '../../utils/api'
import wrapTx from '../wrap_tx'

export const BATCH_SYNC_MQ_MESSAGE = async ({ messages }, options) =>
  wrapTx(() => {
    if (messages.length > 1) {
      return phalaApi.tx.utility.batch(
        messages.map((msg) =>
          phalaApi.tx.phalaMq.syncOffchainMessage(
            phalaApi.createType('SignedMessage', msg)
          )
        )
      )
    } else {
      return phalaApi.tx.phalaMq.syncOffchainMessage(
        phalaApi.createType('SignedMessage', messages[0])
      )
    }
  }, options)

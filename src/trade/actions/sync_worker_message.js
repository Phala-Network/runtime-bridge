import { phalaApi } from '../../utils/api'
import wrapTx from '../wrap_tx'

export const BATCH_SYNC_MQ_MESSAGE = async ({ messages }, options) =>
  wrapTx(
    () =>
      messages.map((msg) =>
        phalaApi.tx.phalaMq.syncOffchainMessage(
          phalaApi.createType('SignedMessage', msg)
        )
      ),
    options
  )

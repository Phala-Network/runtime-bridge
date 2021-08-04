import { phalaApi } from '../../utils/api'
import wrapTx from '../wrap_tx'

const batchSyncMqMessage = async ({ messages }, { operator }) =>
  wrapTx(
    phalaApi.tx.utility.batch(
      messages.map((msg) =>
        phalaApi.tx.phalaMq.syncOffchainMessage(
          phalaApi.createType('Vec<u8>', msg)
        )
      )
    ),
    operator
  )

export { batchSyncMqMessage as BATCH_SYNC_MQ_MESSAGE }

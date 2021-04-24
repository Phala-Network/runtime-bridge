import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const syncWorkerMessage = ({ msg, machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.syncWorkerMessage(msg), account, resolve, reject)
    })()
  )
}

const batchSyncWorkerMessage = (
  { messages, machineRecordId },
  { keyring, api }
) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(
        api,
        api.tx.utility.batch(
          messages.map((msg) => api.tx.phala.syncWorkerMessage(msg))
        ),
        account,
        resolve,
        reject
      )
    })()
  )
}

export {
  syncWorkerMessage as SYNC_WORKER_MESSAGE,
  batchSyncWorkerMessage as BATCH_SYNC_WORKER_MESSAGE,
}

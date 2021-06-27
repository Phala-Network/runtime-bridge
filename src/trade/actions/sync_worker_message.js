import wrapTx from '../wrap_tx'

const syncWorkerMessage = ({ msg, worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.syncWorkerMessage(msg), account, resolve, reject)
    })().catch(reject)
  )
}

const batchSyncWorkerMessage = ({ messages, worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(
        api,
        api.tx.utility.batch(
          messages.map((msg) =>
            api.tx.phala.syncWorkerMessage(api.createType('Vec<u8>', msg))
          )
        ),
        account,
        resolve,
        reject
      )
    })().catch(reject)
  )
}

const batchSyncMqMessage = ({ messages, worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(
        api,
        api.tx.utility.batch(
          messages.map((msg) =>
            api.tx.phala.syncOffchainMessage(api.createType('Vec<u8>', msg))
          )
        ),
        account,
        resolve,
        reject
      )
    })().catch(reject)
  )
}

export {
  syncWorkerMessage as SYNC_WORKER_MESSAGE,
  batchSyncWorkerMessage as BATCH_SYNC_WORKER_MESSAGE,
  batchSyncMqMessage as BATCH_SYNC_MQ_MESSAGE,
}

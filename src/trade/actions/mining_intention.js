import wrapTx from '../wrap_tx'

const startMiningIntention = ({ worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.startMiningIntention(), account, resolve, reject)
    })()
  )
}

const stopMiningIntention = ({ worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.stopMiningIntention(), account, resolve, reject)
    })()
  )
}

export {
  startMiningIntention as START_MINING_INTENTION,
  stopMiningIntention as STOP_MINING_INTENTION,
}

import wrapTx from '../wrap_tx'

const setPayoutPrefs = ({ target, worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(
        api,
        api.tx.phala.setPayoutPrefs(0, target),
        account,
        resolve,
        reject
      )
    })()
  )
}

export default setPayoutPrefs

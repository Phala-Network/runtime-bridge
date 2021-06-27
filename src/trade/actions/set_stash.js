import wrapTx from '../wrap_tx'

const setStash = ({ address, worker }, { keyring, api }) => {
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = worker
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.setStash(address), account, resolve, reject)
    })().catch(reject)
  )
}

export default setStash

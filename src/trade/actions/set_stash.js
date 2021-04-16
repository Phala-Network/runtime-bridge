import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const setStash = ({ address, machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.setStash(address), account, resolve, reject)
    })()
  )
}

export default setStash

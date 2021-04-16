import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const setPayoutPrefs = ({ target, machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
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

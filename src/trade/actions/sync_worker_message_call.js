import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const syncWorkerMessageCall = ({ msg, machineRecordId }, { keyring, api }) => {
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

export default syncWorkerMessageCall

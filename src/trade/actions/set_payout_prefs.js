import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const registerWorker = ({ target, machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise(
    (() => async (resolve, reject) => {
      const account = keyring.createFromJson(
        (await Machine.findOne(machineRecordId))['polkadotJson']
      )
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

export default registerWorker

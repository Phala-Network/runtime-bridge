import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const registerWorker = ({ address, machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise(
    (() => async (resolve, reject) => {
      const account = keyring.createFromJson(
        (await Machine.findOne(machineRecordId))['polkadotJson']
      )
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.setStash(address), account, resolve, reject)
    })()
  )
}

export default registerWorker

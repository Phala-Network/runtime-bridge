import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const startMiningIntention = ({ machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)
      account.decodePkcs8()

      wrapTx(api, api.tx.phala.startMiningIntention(), account, resolve, reject)
    })()
  )
}

const stopMiningIntention = ({ machineRecordId }, { keyring, api }) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
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

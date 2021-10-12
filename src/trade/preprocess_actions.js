import { phalaApi as _api } from '../utils/api'
import { apiProxy as api, wrapTx } from './preprocess'
import BN from 'bn.js'

export const BATCH_SYNC_MQ_MESSAGE = async ({ messages }) =>
  wrapTx(
    messages.map((msg) =>
      api.tx.phalaMq.syncOffchainMessage(_api.createType('SignedMessage', msg))
    )
  )

export const REGISTER_WORKER = async ({ runtimeInfo, attestation }) =>
  wrapTx([api.tx.phalaRegistry.registerWorker(runtimeInfo, attestation)], true)

export const ADD_WORKER = async ({ publicKey, pid }) =>
  wrapTx([api.tx.phalaStakePool.addWorker(pid, publicKey)], true)

export const START_MINING = async ({ pid, publicKey, stake }) => {
  const stakeBn = new BN(stake)
  return wrapTx(
    [
      api.tx.phalaStakePool.startMining(
        pid,
        publicKey,
        stakeBn.toString('hex')
      ),
    ],
    true
  )
}

export const STOP_MINING = async ({ pid, publicKey }) =>
  wrapTx([api.tx.phalaStakePool.stopMining(pid, publicKey)], true)

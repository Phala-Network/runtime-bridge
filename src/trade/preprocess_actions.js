import { phalaApi as _api } from '../utils/api'
import { apiProxy as api, wrapTx } from './preprocess'

export const BATCH_SYNC_MQ_MESSAGE = async ({ messages }) =>
  wrapTx(
    messages.map((msg) =>
      api.tx.phalaMq.syncOffchainMessage(_api.createType('SignedMessage', msg))
    )
  )

export const REGISTER_WORKER = async ({ runtimeInfo, attestation }) => {
  const decodedAttestation = _api.createType(
    'Option<PhalaTypesAttestationReport>',
    _api.createType('Vec<u8>', attestation)
  )
  return wrapTx(
    [api.tx.phalaRegistry.registerWorkerV2(runtimeInfo, decodedAttestation)],
    false
  )
}

export const ADD_WORKER = async ({ publicKey, pid }) =>
  wrapTx([api.tx.phalaStakePoolv2.addWorker(pid, publicKey)], false)

export const START_COMPUTING = async ({ pid, publicKey, stake }) => {
  return wrapTx(
    [
      api.tx.phalaStakePoolv2.startComputing(
        pid,
        publicKey,
        _api.createType('BalanceOf', stake)
      ),
    ],
    false
  )
}

export const STOP_COMPUTING = async ({ pid, publicKey }) =>
  wrapTx([api.tx.phalaStakePoolv2.stopComputing(pid, publicKey)], true)

export const RESTART_COMPUTING = async ({ pid, publicKey, stake }) => {
  return wrapTx(
    [
      api.tx.phalaStakePoolv2.restartComputing(
        pid,
        publicKey,
        _api.createType('BalanceOf', stake)
      ),
    ],
    false
  )
}

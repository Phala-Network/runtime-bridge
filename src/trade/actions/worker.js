import { phalaApi } from '../../utils/api'
import BN from 'bn.js'
import wrapTx from '../wrap_tx'

export const REGISTER_WORKER = async (
  { runtimeInfo, attestation },
  { operator }
) =>
  wrapTx(
    () => phalaApi.tx.phalaRegistry.registerWorker(runtimeInfo, attestation),
    operator
  )

export const ADD_WORKER = async ({ publicKey, pid }, { operator }) =>
  wrapTx(() => phalaApi.tx.phalaStakePool.addWorker(pid, publicKey), operator)

export const START_MINING = async ({ pid, publicKey, stake }, { operator }) => {
  const stakeBn = new BN(stake)
  return wrapTx(
    () => phalaApi.tx.phalaStakePool.startMining(pid, publicKey, stakeBn),
    operator
  )
}

export const STOP_MINING = async ({ pid, publicKey }, { operator }) =>
  wrapTx(() => phalaApi.tx.phalaStakePool.stopMining(pid, publicKey), operator)

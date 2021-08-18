import { phalaApi } from '../../utils/api'
import BN from 'bn.js'
import wrapTx from '../wrap_tx'

export const REGISTER_WORKER = async ({ runtimeInfo, attestation }, options) =>
  wrapTx(
    () => phalaApi.tx.phalaRegistry.registerWorker(runtimeInfo, attestation),
    options
  )

export const ADD_WORKER = async ({ publicKey, pid }, options) =>
  wrapTx(() => phalaApi.tx.phalaStakePool.addWorker(pid, publicKey), options)

export const START_MINING = async ({ pid, publicKey, stake }, options) => {
  const stakeBn = new BN(stake)
  return wrapTx(
    () => phalaApi.tx.phalaStakePool.startMining(pid, publicKey, stakeBn),
    options
  )
}

export const STOP_MINING = async ({ pid, publicKey }, options) =>
  wrapTx(() => phalaApi.tx.phalaStakePool.stopMining(pid, publicKey), options)

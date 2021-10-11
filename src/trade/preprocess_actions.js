import { wrapTx } from './preprocess'
import BN from 'bn.js'

export const BATCH_SYNC_MQ_MESSAGE = async ({ messages }, options) =>
  wrapTx(
    (api) =>
      messages.map((msg) =>
        api.tx.phalaMq.syncOffchainMessage(api.createType('SignedMessage', msg))
      ),
    options
  )

export const REGISTER_WORKER = async ({ runtimeInfo, attestation }, options) =>
  wrapTx(
    (api) => [api.tx.phalaRegistry.registerWorker(runtimeInfo, attestation)],
    options
  )

export const ADD_WORKER = async ({ publicKey, pid }, options) =>
  wrapTx(
    (api) => [api.tx.phalaStakePool.addWorker(pid, publicKey)],
    options,
    true
  )

export const START_MINING = async ({ pid, publicKey, stake }, options) => {
  const stakeBn = new BN(stake)
  return wrapTx(
    (api) => [api.tx.phalaStakePool.startMining(pid, publicKey, stakeBn)],
    options,
    true
  )
}

export const STOP_MINING = async ({ pid, publicKey }, options) =>
  wrapTx(
    (api) => [api.tx.phalaStakePool.stopMining(pid, publicKey)],
    options,
    true
  )

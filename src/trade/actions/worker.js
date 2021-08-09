import { phalaApi } from '../../utils/api'
import wrapTx from '../wrap_tx'

const registerWorker = async ({ runtimeInfo, attestation }, { operator }) =>
  wrapTx(
    phalaApi.tx.phalaRegistry.registerWorker(runtimeInfo, attestation),
    operator
  )

const addWorker = async ({ publicKey, pid }, { operator }) =>
  wrapTx(phalaApi.tx.phalaStakePool.addWorker(pid, publicKey), operator)

export { addWorker as ADD_WORKER, registerWorker as REGISTER_WORKER }

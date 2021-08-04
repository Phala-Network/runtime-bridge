import { phalaApi } from '../../utils/api'
import wrapTx from '../wrap_tx'

const addWorker = async ({ publicKey, pid }, { operator }) =>
  wrapTx(phalaApi.tx.phalaStakePool.addWorker(pid, publicKey), operator)

export { addWorker as ADD_WORKER }

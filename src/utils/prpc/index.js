import { prpc, pruntime_rpc } from './proto.generated'
import { runtimeRequest } from './request'
import PQueue from 'p-queue'
import logger from '../logger'

export const PhactoryAPI = pruntime_rpc.PhactoryAPI

export const createRpcClient = (endpoint) => {
  const clientQueue = new PQueue({ concurrency: 5 })
  return PhactoryAPI.create(
    async (method, requestData, callback) => {
      const url = `${endpoint}/prpc/PhactoryAPI.${method.name}`
      try {
        const res = await clientQueue.add(() =>
          runtimeRequest({
            url,
            data: requestData,
            responseType: 'arraybuffer',
          })
        )

        if (res.status === 200) {
          callback(null, res.data)
        } else {
          const errPb = prpc.PrpcError.decode(res.data)
          logger.warn(prpc.PrpcError.toObject(errPb))
          callback(new Error(errPb.message))
        }
      } catch (e) {
        callback(e)
      }
    },
    false,
    false
  )
}

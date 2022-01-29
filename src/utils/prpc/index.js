import { prpc, pruntime_rpc } from './proto.generated'
import { runtimeRequest } from './request'
import Queue from 'promise-queue'
import logger from '../logger'

export const PhactoryAPI = pruntime_rpc.PhactoryAPI

export const createRpcClient = (endpoint) => {
  const clientQueue = new Queue(5, Infinity)
  return PhactoryAPI.create(
    async (method, requestData, callback) => {
      const url = `${endpoint}/prpc/PhactoryAPI.${method.name}`
      try {
        const res = await clientQueue.add(() =>
          runtimeRequest(url, {
            body: requestData,
            responseType: 'buffer',
          })
        )

        if (res.statusCode === 200) {
          callback(null, res.rawBody)
        } else {
          const errPb = prpc.PrpcError.decode(res.rawBody)
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

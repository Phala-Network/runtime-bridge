import { prpc, pruntime_rpc, default as $root } from './proto.generated'
import fetch from 'node-fetch'
import logger from '../logger'

export const PhactoryAPI = pruntime_rpc.PhactoryAPI

export const createRpcClient = (endpoint) =>
  PhactoryAPI.create(
    async (method, requestData, callback) => {
      const url = `${endpoint}/prpc/PhactoryAPI.${method.name}`
      logger.debug({ url, requestData }, 'Sending HTTP request...')
      const res = await fetch(url, {
        method: 'POST',
        body: requestData,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      })
      const buffer = await res.buffer()
      try {
        if (res.status === 200) {
          callback(null, buffer)
        } else {
          const errPb = prpc.PrpcError.decode(buffer)
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

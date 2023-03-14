import { prpc, pruntime_rpc } from './proto.generated'
import { requestQueue__blob, runtimeRequest } from './request'
import { rpcRequestTimeout } from '../../lifecycle/env'
import PQueue from 'p-queue'
import logger from '../logger'

export const PhactoryAPI = pruntime_rpc.PhactoryAPI

export const queueStore = new Map()
export const getQueue = (endpoint) => {
  let ret = queueStore.get(endpoint)
  if (ret) {
    return ret
  }
  ret = new PQueue({ concurrency: 1 })
  queueStore.set(endpoint, ret)
  return ret
}

export const wrapRequest = (endpoint) => {
  const clientQueue = getQueue(endpoint)
  return async (
    resource,
    body,
    priority = 1000,
    timeout = rpcRequestTimeout
  ) => {
    const url = `${endpoint}${resource}`
    const t1 = Date.now()
    const res = await clientQueue.add(
      () =>
        runtimeRequest(
          {
            url,
            data: body,
            responseType: 'json',
            timeout,
          },
          requestQueue__blob
        ),
      { priority }
    )

    const data = res.data
    const payload = JSON.parse(data.payload)
    const t2 = Date.now()

    logger.info(`Waiting for result from ${url} used ${t2 - t1}ms`)

    if (data.status === 'ok') {
      return {
        ...data,
        payload,
      }
    }

    logger.warn({ url, data }, 'Receiving with error...')
    throw {
      ...data,
      payload,
      isRuntimeReturnedError: true,
    }
  }
}

export const createRpcClient = (endpoint) => {
  const clientQueue = getQueue(endpoint)
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

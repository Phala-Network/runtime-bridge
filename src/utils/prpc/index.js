import { PRPC_QUEUE_SIZE } from '../constants'
import { prpc, pruntime_rpc } from './proto.generated'
import Queue from 'promise-queue'
import fetch from 'node-fetch'
import logger from '../logger'
import promiseRetry from 'promise-retry'
import wait from '../wait'

const requestQueue = new Queue(PRPC_QUEUE_SIZE, Infinity)

export const PhactoryAPI = pruntime_rpc.PhactoryAPI

export const createRpcClient = (endpoint) => {
  const clientQueue = new Queue(5, Infinity)
  return PhactoryAPI.create(
    async (method, requestData, callback) => {
      const url = `${endpoint}/prpc/PhactoryAPI.${method.name}`
      logger.debug({ url, requestData }, 'Sending HTTP request...')
      await wait(100)
      try {
        const res = await clientQueue.add(() =>
          promiseRetry(
            (retry) =>
              requestQueue
                .add(() =>
                  fetch(url, {
                    method: 'POST',
                    body: requestData,
                    headers: {
                      'Content-Type': 'application/octet-stream',
                    },
                    timeout: 10000,
                  })
                )
                .catch((...args) => {
                  logger.warn(...args)
                  return retry(...args)
                }),
            {
              retries: 3,
              minTimeout: 1000,
              maxTimeout: 30000,
            }
          )
        )

        const buffer = await res.buffer()
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
}

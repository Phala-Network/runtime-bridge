import { PRPC_QUEUE_SIZE } from '../constants'
import { enableKeepAlive, keepAliveTimeout } from '../env'
import { prpc, pruntime_rpc } from './proto.generated'
import HttpAgent from 'agentkeepalive'
import Queue from 'promise-queue'
import got from 'got'
import logger from '../logger'
import wait from '../wait'

export const requestQueue = new Queue(PRPC_QUEUE_SIZE, Infinity)

const keepAliveOptions = {
  keepAlive: enableKeepAlive,
  maxFreeSockets: 12888,
  freeSocketTimeout: keepAliveTimeout,
}

logger.info(keepAliveOptions, 'keepAliveOptions')

export const PhactoryAPI = pruntime_rpc.PhactoryAPI
export const keepaliveAgent = new HttpAgent(keepAliveOptions)

export const createRpcClient = (endpoint) => {
  const clientQueue = new Queue(5, Infinity)
  return PhactoryAPI.create(
    async (method, requestData, callback) => {
      const url = `${endpoint}/prpc/PhactoryAPI.${method.name}`
      logger.debug({ url, requestData }, 'Sending HTTP request...')
      try {
        const res = await clientQueue.add(() =>
          requestQueue.add(() =>
            got(url, {
              method: 'POST',
              body: requestData,
              headers: {
                'Content-Type': 'application/octet-stream',
              },
              timeout: 30000,
              retry: {
                limit: 5,
                methods: ['POST'],
                errorCodes: [
                  'ETIMEDOUT',
                  'ECONNRESET',
                  'EADDRINUSE',
                  'ECONNREFUSED',
                  'EPIPE',
                  'ENOTFOUND',
                  'ENETUNREACH',
                  'EAI_AGAIN',
                ],
              },
              agent: {
                http: keepaliveAgent,
              },
              hooks: {
                beforeRetry: [
                  (options, error, retryCount) => {
                    logger.warn({ retryCount, url }, error)
                  },
                ],
              },
              responseType: 'buffer',
            })
          )
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

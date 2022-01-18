import { PRPC_QUEUE_SIZE } from '../constants'
import { enableKeepAlive, keepAliveTimeout } from '../env'
import HttpAgent from 'agentkeepalive'
import Queue from 'promise-queue'
import got from 'got'
import logger from '../logger'

export const requestQueue = new Queue(PRPC_QUEUE_SIZE, Infinity)
export const requestQueue__blob = new Queue(PRPC_QUEUE_SIZE, Infinity)

const keepAliveOptions = {
  keepAlive: enableKeepAlive,
  maxFreeSockets: 65535,
  freeSocketTimeout: keepAliveTimeout,
}
logger.info(keepAliveOptions, 'keepAliveOptions')

export const keepaliveAgent = new HttpAgent(keepAliveOptions)

const RUNTIME_REQUEST_BASE_OPTIONS = Object.freeze({
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
  },
  timeout: 10000,
  retry: {
    limit: 2,
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
        logger.debug({ retryCount, url: options.url }, error)
      },
    ],
  },
})

export const runtimeRequest = (url, options, queue = requestQueue) =>
  queue.add(() =>
    got(url, Object.assign(options, RUNTIME_REQUEST_BASE_OPTIONS))
  )

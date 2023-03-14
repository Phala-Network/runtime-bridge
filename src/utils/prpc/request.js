import {
  prpcQueueSize,
  rpcRequestTimeout,
  workerKeepaliveEnabled,
  workerKeepaliveTimeout,
} from '../../lifecycle/env'
import PQueue from 'p-queue'
import axios from 'axios'
import http from 'http'
import https from 'https'
import logger from '../logger'

export const requestQueue = new PQueue({
  concurrency: prpcQueueSize,
})
export const requestQueue__blob = new PQueue({
  concurrency: prpcQueueSize,
})

const agentOptions = workerKeepaliveEnabled
  ? { keepAlive: true, timeout: workerKeepaliveTimeout }
  : { keepAlive: false }

const httpAgent = new http.Agent(agentOptions)
const httpsAgent = new https.Agent(agentOptions)

const axiosInstance = axios.create({
  timeout: rpcRequestTimeout,
  method: 'post',
  headers: {
    'Content-Type': 'application/octet-stream',
  },
  responseType: 'arraybuffer',
  maxBodyLength: Infinity,
  httpAgent,
  httpsAgent,
})

export const runtimeRequest = (options, queue = requestQueue) =>
  queue.add(async () => {
    const t1 = Date.now()
    const ret = await axiosInstance.request(options)
    const t2 = Date.now()
    logger.info(`requesting to ${options.url} used {t2 - t1}ms`)
  })

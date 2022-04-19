import { prpcQueueSize, rpcRequestTimeout } from '../../lifecycle/env'
import PQueue from 'p-queue'
import axios from 'axios'

export const requestQueue = new PQueue({
  concurrency: prpcQueueSize,
})
export const requestQueue__blob = new PQueue({
  concurrency: prpcQueueSize,
})

const axiosInstance = axios.create({
  timeout: rpcRequestTimeout,
  method: 'post',
  headers: {
    'Content-Type': 'application/octet-stream',
  },
  responseType: 'arraybuffer',
  maxBodyLength: Infinity,
})

export const runtimeRequest = (options, queue = requestQueue) =>
  queue.add(() => axiosInstance.request(options))

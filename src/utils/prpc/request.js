import { PRPC_QUEUE_SIZE } from '../constants'
import PQueue from 'p-queue'
import axios from 'axios'

export const requestQueue = new PQueue({
  concurrency: PRPC_QUEUE_SIZE,
})
export const requestQueue__blob = new PQueue({
  concurrency: PRPC_QUEUE_SIZE,
})

const axiosInstance = axios.create({
  timeout: 8000,
  method: 'post',
  headers: {
    'Content-Type': 'application/octet-stream',
  },
  responseType: 'arraybuffer',
})

export const runtimeRequest = (options, queue = requestQueue) =>
  queue.add(() => axiosInstance.request(options))

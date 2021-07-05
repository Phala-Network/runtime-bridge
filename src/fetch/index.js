import cluster from 'cluster'
import fork from '../utils/fork'
import os from 'os'
import setupRpc from './rpc'

export const SET_INIT_HEIGHT = 'SET_INIT_HEIGHT'
export const SET_KNOWN_HEIGHT = 'SET_KNOWN_HEIGHT'
export const SET_BLOB_HEIGHT = 'SET_BLOB_HEIGHT'
export const SET_ARCHIVED_HEIGHT = 'SET_ARCHIVED_HEIGHT'

const start = () =>
  new Promise((resolve) => {
    const context = {
      hostname: os.hostname(),
      knownHeight: -1,
      initHeight: -1,
      blobHeight: -1,
      archivedHeight: -1,
      hasReachedInitHeight: false,
    }

    const [syncBlockProcess, computeWindowProcess] = [
      'sync_block',
      'compute_window',
    ].map((cmd) => fork(cmd, 'fetch/' + cmd))

    syncBlockProcess.on('message', (message) => {
      if (typeof message[SET_INIT_HEIGHT] === 'number') {
        if (context.initHeight === -1) {
          context.initHeight = message[SET_INIT_HEIGHT]
        }
      }

      if (typeof message[SET_KNOWN_HEIGHT] === 'number') {
        if (context.knownHeight < message[SET_KNOWN_HEIGHT]) {
          context.knownHeight = message[SET_KNOWN_HEIGHT]
        }
      }
    })

    computeWindowProcess.on('message', (message) => {
      if (typeof message[SET_BLOB_HEIGHT] === 'number') {
        if (context.blobHeight < message[SET_BLOB_HEIGHT]) {
          context.blobHeight = message[SET_BLOB_HEIGHT]
          if (!context.hasReachedInitHeight) {
            if (context.blobHeight >= context.initHeight) {
              context.hasReachedInitHeight = true
            }
          }
        }
      }

      if (typeof message[SET_ARCHIVED_HEIGHT] === 'number') {
        if (context.archivedHeight < message[SET_ARCHIVED_HEIGHT]) {
          context.archivedHeight = message[SET_ARCHIVED_HEIGHT]
        }
      }
    })

    setupRpc(context)

    cluster.on('exit', resolve)
  })

export default start

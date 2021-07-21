import cluster from 'cluster'
import fork from '../utils/fork'
import os from 'os'
import setupRpc from './rpc'

export const SET_GENESIS = 'SET_GENESIS'

export const SET_PARA_KNOWN_HEIGHT = 'SET_PARA_KNOWN_HEIGHT'
export const SET_PARENT_KNOWN_HEIGHT = 'SET_PARENT_KNOWN_HEIGHT'

export const SET_BLOB_HEIGHT = 'SET_BLOB_HEIGHT'
export const SET_ARCHIVED_HEIGHT = 'SET_ARCHIVED_HEIGHT'

const start = () =>
  new Promise((resolve) => {
    const context = {
      hostname: os.hostname(),
      paraId: -1,

      parentStartHeader: -1,

      parentKnownHeight: -1,
      parentBlobHeight: -1,
      parentArchivedHeight: -1,

      paraKnownHeight: -1,
      paraBlobHeight: -1,
      paraArchivedHeight: -1,

      synched: false,
    }

    const [syncBlockProcess, computeWindowProcess] = [
      'sync_block',
      // 'compute_window',
    ].map((cmd) => fork(cmd, 'fetch/' + cmd))

    const ipcHandlers = {
      [SET_GENESIS]: ({ paraId, parentNumber }) => {
        context.paraId = paraId
        context.parentStartHeader = parentNumber
      },
      [SET_PARA_KNOWN_HEIGHT]: (number) => {
        context.paraKnownHeight = number
      },
      [SET_PARENT_KNOWN_HEIGHT]: (number) => {
        context.parentKnownHeight = number
      },
    }

    syncBlockProcess.on('message', ({ type, payload }) => {
      ipcHandlers[type](payload)
    })

    setupRpc(context)

    cluster.on('exit', resolve)
  })

export default start

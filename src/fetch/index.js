import { MIN_SYNCHED_DISTANCE } from '../utils/constants'
import cluster from 'cluster'
import fork from '../utils/fork'
import os from 'os'
import setupRpc from './rpc'

export const SET_GENESIS = 'SET_GENESIS'

export const SET_PARA_KNOWN_HEIGHT = 'SET_PARA_KNOWN_HEIGHT'
export const SET_PARENT_KNOWN_HEIGHT = 'SET_PARENT_KNOWN_HEIGHT'

export const SET_PARA_BLOB_HEIGHT = 'SET_PARA_BLOB_HEIGHT'
export const SET_PARENT_BLOB_HEIGHT = 'SET_PARENT_BLOB_HEIGHT'

export const SET_PARA_ARCHIVED_HEIGHT = 'SET_PARA_ARCHIVED_HEIGHT'
export const SET_PARENT_ARCHIVED_HEIGHT = 'SET_PARENT_ARCHIVED_HEIGHT'

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

    const checkSynched = () => {
      if (context.synched) {
        return
      }

      const {
        paraKnownHeight,
        paraBlobHeight,
        parentKnownHeight,
        parentBlobHeight,
      } = context

      if (
        paraKnownHeight - paraBlobHeight < MIN_SYNCHED_DISTANCE &&
        parentKnownHeight - parentBlobHeight < MIN_SYNCHED_DISTANCE
      ) {
        context.synched = true
      }
    }

    const syncBlockProcess = fork('sync_block', 'fetch/' + 'sync_block')

    const ipcHandlers = {
      [SET_GENESIS]: ({ paraId, parentNumber }) => {
        context.paraId = paraId
        context.parentStartHeader = parentNumber

        const computeWindowProcess = fork(
          'compute_window',
          'fetch/' + 'compute_window',
          {
            PHALA_IPC_PARA_ID: paraId,
          }
        )

        computeWindowProcess.on('message', ({ type, payload }) => {
          ipcHandlers[type](payload)
        })
      },
      [SET_PARA_KNOWN_HEIGHT]: (number) => {
        if (number > context.paraKnownHeight) {
          context.paraKnownHeight = number
        }
      },
      [SET_PARENT_KNOWN_HEIGHT]: (number) => {
        if (number > context.parentKnownHeight) {
          context.parentKnownHeight = number
        }
      },
      [SET_PARA_BLOB_HEIGHT]: (number) => {
        if (number > context.paraBlobHeight) {
          context.paraBlobHeight = number
          checkSynched()
        }
      },
      [SET_PARENT_BLOB_HEIGHT]: (number) => {
        if (number > context.parentBlobHeight) {
          context.parentBlobHeight = number
          checkSynched()
        }
      },
      [SET_PARA_ARCHIVED_HEIGHT]: (number) => {
        if (number > context.paraArchivedHeight) {
          context.paraArchivedHeight = number
        }
      },
      [SET_PARENT_ARCHIVED_HEIGHT]: (number) => {
        if (number > context.parentArchivedHeight) {
          context.parentArchivedHeight = number
        }
      },
    }

    syncBlockProcess.on('message', ({ type, payload }) => {
      ipcHandlers[type](payload)
    })

    setupRpc(context)

    cluster.on('exit', resolve)
  })

export default start

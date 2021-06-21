import cluster from 'cluster'
import fork from '../utils/fork'
import logger from '../utils/logger'
import startRpc from './rpc'

export const FETCH_RECEIVED_HEIGHT = 'FETCH_RECEIVED_HEIGHT'
export const FETCH_REACHED_TARGET = 'FETCH_REACHED_TARGET'

const start = () =>
  new Promise((resolve, reject) => {
    const context = {
      receivedHeight: -1,
      initTarget: -1,
      hasReachedTarget: false,
    }

    const [syncBlockProcess] = ['sync_block', 'compute_window'].map((cmd) =>
      fork(cmd, 'fetch/' + cmd)
    )

    syncBlockProcess.on('message', (message) => {
      if (typeof message[FETCH_RECEIVED_HEIGHT] === 'number') {
        context.receivedHeight = message[FETCH_RECEIVED_HEIGHT]
        logger.debug(context, 'Block Received.')
      }
      if (typeof message[FETCH_REACHED_TARGET] === 'number') {
        if (context.initTarget > -1 || context.hasReachedTarget) {
          reject(new Error('Unexcepted message: ' + FETCH_REACHED_TARGET))
        }
        context.hasReachedTarget = true
        context.initTarget = message[FETCH_REACHED_TARGET]
        logger.info(context, 'Synched to init target height...')
      }
    })

    startRpc(context)

    cluster.on('exit', resolve)
  })

export default start

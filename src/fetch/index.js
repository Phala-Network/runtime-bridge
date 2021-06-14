import cluster from 'cluster'
import fork from '../utils/fork'
import logger from '../utils/logger'

export const FETCH_RECEIVED_HEIGHT = 'FETCH_RECEIVED_HEIGHT'
export const FETCH_REACHED_TARGET = 'FETCH_REACHED_TARGET'

const start = () =>
  new Promise((resolve, reject) => {
    let receivedHeight = -1
    let initTarget = -1
    let hasReachedTarget = false

    const [syncBlockProcess] = [
      'sync_block',
      // 'compute_window',
      // 'organize_blob'
    ].map((cmd) => fork(cmd, 'fetch/' + cmd))

    syncBlockProcess.on('message', (message) => {
      if (typeof message[FETCH_RECEIVED_HEIGHT] === 'number') {
        receivedHeight = message[FETCH_RECEIVED_HEIGHT]
        logger.debug({ receivedHeight }, 'Block Received.')
      }
      if (typeof message[FETCH_REACHED_TARGET] === 'number') {
        if (initTarget > -1 || hasReachedTarget) {
          reject(new Error('Unexcepted message: ' + FETCH_REACHED_TARGET))
        }
        hasReachedTarget = true
        initTarget = message[FETCH_REACHED_TARGET]
        logger.info({ initTarget }, 'Synched to init target height...')
      }
    })
    cluster.on('exit', resolve)
  })

export default start

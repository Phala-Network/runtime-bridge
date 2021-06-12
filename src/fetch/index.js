import cluster from 'cluster'
import fork from '../utils/fork'

const start = () =>
  new Promise((resolve) => {
    const workers = {}
    ;[
      // 'rpc',
      'sync_block',
      // 'compute_window',
      // 'organize_blob'
    ].forEach((cmd) => {
      workers[cmd.toUpperCase] = fork(cmd, 'fetch/' + cmd)
    })
    cluster.on('exit', resolve)
  })

export default start

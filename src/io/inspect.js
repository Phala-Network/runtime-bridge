import { DB_KEYS, getPort, setupDb } from './db'
import { createViewerServer } from '@pcan/leveldb-viewer'

const start = async () => {
  const dbs = await setupDb(...DB_KEYS)
  const ports = DB_KEYS.map(getPort)
  const servers = dbs.map((db) => createViewerServer(db))

  servers.forEach((s, i) => {
    s.listen(ports[i])
  })
}

export default start

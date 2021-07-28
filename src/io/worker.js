import { DB_WORKER } from './db'
import { createUpdatable } from './updatable'
import { prb } from '../message/proto.generated'

export const UPool = createUpdatable({
  name: 'pool',
  dbKey: DB_WORKER,
  existenceKeys: ['pid', 'name', 'owner'],
  uniqueKeys: ['pid', 'name'],
  pbType: prb.db.Pool,
})

export const UWorker = createUpdatable({
  name: 'worker',
  dbKey: DB_WORKER,
  existenceKeys: ['pid', 'name', 'endpoint'],
  uniqueKeys: ['endpoint', 'name'],
  pbType: prb.db.Worker,
})

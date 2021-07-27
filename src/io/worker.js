import { DB_WORKER } from './db'
import { createUpdatable } from './updatable'
import { prb } from '../message/proto.generated'

export const UPool = createUpdatable({
  name: 'pool',
  dbKey: DB_WORKER,
  existanceKeys: ['pid', 'name', 'owner'],
  uniqueKeys: ['pid', 'name'],
  pbType: prb.db.Pool,
})

export const UWorker = createUpdatable({
  name: 'pool',
  dbKey: DB_WORKER,
  existanceKeys: ['pid', 'name', 'endpoint'],
  uniqueKeys: ['endpoint', 'name'],
  pbType: prb.db.Worker,
})

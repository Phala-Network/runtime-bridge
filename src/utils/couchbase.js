import { Ottoman } from 'ottoman'
import wait from './wait'

import MachineSchema from '@/models/machine'
import OrganizedBlobSchema from '@/models/organized_blob'
import PhalaBlockSchema from '@/models/phala_block'
import RuntimeWindowSchema from '@/models/runtime_window'
import WorkerStateSchema from '@/models/worker_state'

export const start = async (uri) => {
  const ottoman = new Ottoman()
  ottoman.connect(uri)

  ottoman.model('Machine', MachineSchema)
  ottoman.model('OrganizedBlob', OrganizedBlobSchema)
  ottoman.model('PhalaBlock', PhalaBlockSchema)
  ottoman.model('RuntimeWindow', RuntimeWindowSchema)
  ottoman.model('WorkerState', WorkerStateSchema)

  if (process.env.NODE_ENV === 'development') {
    globalThis.ottoman = ottoman
  }

  await ottoman.ensureCollections()
  await ottoman.ensureIndexes()
  await wait(3000)
  await ottoman.start()
  return ottoman
}

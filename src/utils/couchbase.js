import { Ottoman } from "ottoman"

import MachineSchema from '@/models/machine'
import OrganizedBlobSchema from '@/models/organized_blob'
import PhalaBlockSchema from '@/models/phala_block'
import RuntimeWindowSchema from '@/models/runtime_window'

export const start = async (uri) => {
  const ottoman = new Ottoman()
  ottoman.connect(uri)

  if (process.env.NODE_ENV === 'development') {
    globalThis.ottoman = ottoman
  }

  ottoman.model('Machine', MachineSchema)
  ottoman.model('OrganizedBlob', OrganizedBlobSchema)
  ottoman.model('PhalaBlock', PhalaBlockSchema)
  ottoman.model('RuntimeWindow', RuntimeWindowSchema)

  await ottoman.start()
  return ottoman
}

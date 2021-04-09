import protobuf from 'protobufjs'
import protoDef from '@/utils/proto.json'

const protoRoot = protobuf.Root.fromJSON(protoDef)
const Message = protoRoot.lookup('prb.Message')

if (process.env.NODE_ENV === 'development') {
  globalThis.protoRoot = protoRoot
}

export {
  protoRoot,
  Message
}

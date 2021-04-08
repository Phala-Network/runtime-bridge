import protobuf from 'protobufjs'
import protoDef from '@/utils/proto.json'

const protoRoot = protobuf.Root.fromJSON(protoDef)
const Message = protoRoot.lookup('prb.Message')

export {
  protoRoot,
  Message
}

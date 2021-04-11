import protobuf from 'protobufjs'
import protoDef from '@/utils/proto.json'

const protoRoot = protobuf.Root.fromJSON(protoDef)

if (process.env.NODE_ENV === 'development') {
  globalThis.protoRoot = protoRoot
}

export const Message = protoRoot.lookup('prb.Message')
export const MessageType = protoRoot.lookup('prb.MessageType')
export const MessageTarget = protoRoot.lookup('prb.MessageTarget')

export {
  protoRoot
}

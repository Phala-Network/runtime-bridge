import protobuf from 'protobufjs'
import path from 'path'

const __dirname = path.dirname(import.meta.url).replace(/^file:\/\/\//, '/')
const protoPath = path.join(__dirname, '../vendor/proto/message.proto')

const protoRoot = protobuf.loadSync(protoPath)

if (process.env.NODE_ENV === 'development') {
  globalThis.protoRoot = protoRoot
}

export const Message = protoRoot.lookup('prb.Message')
export const MessageType = protoRoot.lookup('prb.MessageType')
export const MessageTarget = protoRoot.lookup('prb.MessageTarget')

export { protoRoot }

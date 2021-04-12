import { Schema } from 'ottoman'

const MachineSchema = new Schema({
  nickname: {
    type: String,
    require: false,
  },
  phalaSs58Address: {
    type: String,
    require: true,
  },
  publicKey: {
    type: String,
    require: true,
  },
  polkadotJson: {
    type: String,
    require: true,
  },
  runtimeEndpoint: {
    type: String,
    require: true,
  },
  payoutAddress: {
    type: String,
    require: true,
  },
})

MachineSchema.index.findRefNickname = {
  by: 'nickname',
  type: 'n1ql',
}

MachineSchema.index.findByAddress = {
  by: 'phalaSs58Address',
  type: 'n1ql',
}

MachineSchema.index.findByPublicKey = {
  by: 'publicKey',
  type: 'n1ql',
}

MachineSchema.index.findByRuntimeEndpoint = {
  by: 'runtimeEndpoint',
  type: 'n1ql',
}

MachineSchema.index.findByPayoutAddress = {
  by: 'payoutAddress',
  type: 'n1ql',
}

export default MachineSchema

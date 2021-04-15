import { Schema } from 'ottoman'

const MachineSchema = new Schema({
  nickname: {
    type: String,
    require: false,
  },
  phalaSs58Address: {
    type: String,
    required: true,
  },
  polkadotJson: {
    type: String,
    required: true,
  },
  runtimeEndpoint: {
    type: String,
    required: true,
  },
  payoutAddress: {
    type: String,
    required: true,
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

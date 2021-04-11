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
})

MachineSchema.index.findRefNickname = {
  by: 'nickname',
  type: 'refdoc',
}

MachineSchema.index.findByAddress = {
  by: 'phalaSs58Address',
  type: 'view',
}

MachineSchema.index.findByPublicKey = {
  by: 'publicKey',
  type: 'view',
}

MachineSchema.index.findByRuntimeEndpoint = {
  by: 'runtimeEndpoint',
  type: 'view',
}

export default MachineSchema

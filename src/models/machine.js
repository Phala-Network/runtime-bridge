import { Nohm, NohmModel } from "nohm"

class Machine extends NohmModel {}

const name = 'Machine'
const properties = {
  nickname: {
    type: 'string',
    unique: false,
    index: true
  },
  phalaSs58Address: {
    type: 'string',
    unique: true,
    index: true,
    validations: ['notEmpty']
  },
  publicKey: {
    type: 'string',
    unique: true,
    index: true,
    validations: ['notEmpty']
  },
  polkadotJson: {
    type: 'json',
    unique: false,
    index: false,
    validations: ['notEmpty']
  },
  runtimeEndpoint: {
    type: 'string',
    unique: false,
    index: false,
    validations: ['notEmpty']
  }
}

Machine.modelName = name
Machine.definitions = properties

export default Nohm.register(Machine)

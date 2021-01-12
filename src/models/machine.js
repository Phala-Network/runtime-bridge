import { Nohm } from "nohm"

const name = 'Machine'
const options = {
  properties: {
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
}

export default Nohm.model(name, options)
export const createModel = (_o = {}) => Nohm.model(name, { ...options, ..._o })

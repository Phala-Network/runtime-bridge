import { Nohm } from "nohm"

const name = 'Machine'
const options = {
  properties: {
    alias: {
      type: 'string',
      unique: false,
      index: true
    },
    ss58Address: {
      type: 'string',
      unique: true,
      index: true,
      validations: ['notEmpty']
    },
    privateKey: {
      type: 'string',
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
export const createModel = (client, _o = {}) => new Promise(resolve => {
  client.on('ready', () => {
    resolve(Nohm.model(name, { ...options, ..._o, client }))
  })
})

import infraModule from './infra'
import lifecycleModule from './lifecycle'
import mgmtModule from './mgmt'

const modules = [infraModule, lifecycleModule, mgmtModule]
const types = ['queryHandlers', 'plainHandlers']

const createHandlers = (context) => {
  const wrapHandler = (fn) => (message) => fn(message, context)

  const ret = {}

  types.forEach((t) => {
    ret[t] = {}
    modules.forEach((m) => {
      Object.entries(m[t] || {}).forEach(([k, v]) => {
        ret[t][k] = wrapHandler(v)
      })
    })
  })

  return ret
}

export default createHandlers

import infraModule from './infra'
import lifecycleModule from './lifecycle'
import logger from '../../utils/logger'
import mgmtModule from './mgmt'

const modules = [infraModule, lifecycleModule, mgmtModule]
const types = ['queryHandlers', 'plainHandlers']

const createHandlers = (context) => {
  const wrapHandler = (fn) => async (message) =>
    fn(message, context).catch((e) => {
      logger.error(e)
      return {
        error: {
          extra: e.message,
        },
      }
    })

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

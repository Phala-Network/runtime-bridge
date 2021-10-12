import * as actions from './preprocess_actions'

const noop = () => {}

export const preprocess = async (job) => {
  const action = job.data?.action
  const pid = job.data?.payload?.pid

  if (!(action && pid)) {
    new Error('Invalid job!')
  }

  const jobMeta = await actions[action](job.data.payload)
  Object.assign(jobMeta, {
    id: job.id,
    pid: `${pid}`,
    getRawJob: () => job,
  })

  return jobMeta
}

export const apiProxy = new Proxy(noop, {
  get: (_, rootProp) => {
    const result = [rootProp]
    const subProxy = Proxy.revocable(noop, {
      get: (_, prop) => {
        result.push(prop)
        return subProxy.proxy
      },
      apply: (_, __, argArray) => {
        result.push(
          argArray.map((arg) => {
            if (typeof arg === 'string') {
              return arg
            }
            if (arg.toHex) {
              return arg.toHex()
            }
            throw new Error(
              `Invalid arguments for call: api.${result.join('.')}`
            )
          })
        )
        return finish()
      },
    })
    const finish = () => {
      subProxy.revoke()
      return result
    }
    return subProxy.proxy
  },
})

export const wrapTx = (calls, shouldRetry = false) => ({
  shouldRetry,
  calls,
})
export { actions }

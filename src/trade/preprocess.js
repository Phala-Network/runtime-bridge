import * as actions from './preprocess_actions'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}

export const preprocess = async (job) => {
  const action = job.data?.action
  const pid = job.data?.payload?.pid

  if (!(action && pid)) {
    new Error('Invalid job!')
  }
  let resultPromise__resolve, resultPromise__reject
  const resultPromise = new Promise((resolve, reject) => {
    resultPromise__resolve = resolve
    resultPromise__reject = reject
  })

  const jobMeta = await actions[action](job.data.payload)
  Object.assign(jobMeta, {
    id: job.id,
    pid: `${pid}`,
    getRawJob: () => job,
    getResultPromise: () => resultPromise,
    resultPromise__resolve,
    resultPromise__reject,
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
            if (arg.toString) {
              return arg.toString()
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

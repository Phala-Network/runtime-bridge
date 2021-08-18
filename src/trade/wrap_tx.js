export const wrapTx = async (makeTx, options) => {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  options.sendQueue.push({
    makeTx,
    promise,
    resolve,
    reject,
    options,
  })

  return await promise
}

export default wrapTx

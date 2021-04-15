const wrapTx = (api, tx, account, resolve, reject) => {
  tx.signAndSend(account, ({ status, dispatchError }) => {
    if (status.isUsurped || status.isDropped || status.isInvalid) {
      return reject(`${status}`)
    }
    if (status.isInBlock) {
      console.log(`${status}`)
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule)
          const { documentation, name, section } = decoded

          return reject(
            new Error(`${section}.${name}: ${documentation.join(' ')}`)
          )
        } else {
          return reject(new Error(dispatchError.toString()))
        }
      } else {
        return resolve(`${status}`)
      }
    }
  }).catch(reject)
}

export { wrapTx }

export default wrapTx

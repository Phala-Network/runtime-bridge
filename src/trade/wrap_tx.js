import { phalaApi } from '../utils/api'
import logger from '../utils/logger'

export const wrapTx = (tx, operator) =>
  new Promise((resolve, reject) => {
    tx.signAndSend(operator, ({ status, dispatchError }) => {
      try {
        if (status.isUsurped || status.isDropped || status.isInvalid) {
          return reject(`${status}`)
        }
        if (status.isInBlock) {
          logger.debug(status.toJSON())
          if (dispatchError) {
            if (dispatchError.isModule) {
              const decoded = phalaApi.registry.findMetaError(
                dispatchError.asModule
              )
              logger.debug(decoded)
              const { documentation, name, section } = decoded

              return reject(
                new Error(`${section}.${name}: ${documentation?.join(' ')}`)
              )
            } else {
              return reject(new Error(dispatchError.toString()))
            }
          } else {
            return resolve(`${status}`)
          }
        }
      } catch (e) {
        reject(e)
      }
    }).catch(reject)
  })

export default wrapTx

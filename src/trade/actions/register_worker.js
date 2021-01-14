import { base64Decode } from '@polkadot/util-crypto'

const getMachineOwner = ({ encodedRuntimeInfo, attestation, machineRecordId }, { Machine, keyring, api }) => {
  return new Promise(async (resolve, reject) => {
    const account = keyring.createFromJson(
      (await Machine.load(machineRecordId)).property('polkadotJson')
    )
    const encodedRuntimeInfoBytes = api.createType('Bytes', encodedRuntimeInfo)
    const reportBytes = api.createType('Bytes', attestation.payload.report)

    // Workaround for an unknown encoding bug
    const signature = api.createType('Bytes', Array.from(base64Decode(attestation.payload.signature)))
    const signingCert = api.createType('Bytes', Array.from(base64Decode(attestation.payload.signing_cert)))
    account.decodePkcs8()

    api.tx.phalaModule
      .registerWorker(
        encodedRuntimeInfoBytes,
        reportBytes,
        signature,
        signingCert
      )
      .signAndSend(account, ({ status, dispatchError }) => {
        if (status.isUsurped || status.isDropped || status.isInvalid) {
          return reject(`${status}`)
        }
        if (status.isInBlock) {
          console.log(`${status}`)
          if (dispatchError) {
            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule)
              const { documentation, name, section } = decoded

              return reject(new Error(`${section}.${name}: ${documentation.join(' ')}`))
            } else {
              return reject(new Error(dispatchError.toString()))
            }
          } else {
            return resolve(`${status}`)
          }
        }
      })
  })
}

export default getMachineOwner

import { base64Decode } from '@polkadot/util-crypto'
import { getModel } from 'ottoman'
import wrapTx from '../wrap_tx'

const registerWorker = (
  { encodedRuntimeInfo, attestation, machineRecordId },
  { keyring, api }
) => {
  const Machine = getModel('Machine')
  return new Promise((resolve, reject) =>
    (async () => {
      const { polkadotJson } = await Machine.findById(machineRecordId)
      const account = keyring.createFromJson(JSON.parse(polkadotJson).pair)

      const encodedRuntimeInfoBytes = api.createType(
        'Bytes',
        encodedRuntimeInfo
      )
      const reportBytes = api.createType('Bytes', attestation.payload.report)

      // Workaround for an unknown encoding bug
      const signature = api.createType(
        'Bytes',
        Array.from(base64Decode(attestation.payload.signature))
      )
      const signingCert = api.createType(
        'Bytes',
        Array.from(base64Decode(attestation.payload.signing_cert))
      )
      account.decodePkcs8()

      wrapTx(
        api,
        api.tx.phala.registerWorker(
          encodedRuntimeInfoBytes,
          reportBytes,
          signature,
          signingCert
        ),
        account,
        resolve,
        reject
      )
    })()
  )
}

export default registerWorker

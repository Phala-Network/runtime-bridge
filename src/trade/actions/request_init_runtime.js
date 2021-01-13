import createKeyring from "@/utils/keyring"

const requestInitRuntime = async ({ identity }, { Machine }) => {
  let record

  try {
    record = await Machine.load(identity)
    console.log(record)
  } catch (e) {
    if (e.message === 'not found') {
      let recordId = (await Machine.find({ phalaSs58Address: identity }))[0]
      if (!recordId) {
        recordId = (await Machine.find({ publicKey: identity }))[0]
      }
      if (!recordId) {
        recordId = (await Machine.find({ nickname: identity }))[0]
      }
      record = await Machine.load(recordId)
    } else {
      throw e
    }
  }

  const keyring = await createKeyring()
  const account = keyring.addFromJson(record.property('polkadotJson'))
  return {
    recordId: record.id,
    runtimeEndpoint: record.property('runtimeEndpoint')
  }
}

export default requestInitRuntime

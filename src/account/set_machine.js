import { PHALA_SS58_FORMAT } from '@/utils/constants'
import { Keyring } from '@polkadot/keyring'
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto'
import createRedisClient from '@/utils/redis'
import Machine from '@/models/machine'

const createKeyring = async () => {
  await cryptoWaitReady()
  return new Keyring({
    type: 'sr25519',
    ss58Format: PHALA_SS58_FORMAT
  })
}

const setMachine = async ({ nickname, criticalRedisEndpoint, pruntimeEndpoint: runtimeEndpoint, controllerMnemonic }) => {
  const keyring = await createKeyring()
  await createRedisClient(criticalRedisEndpoint, true)

  const account = keyring.addFromUri(controllerMnemonic)
  const publicKey = encodeAddress(account.publicKey)
  const polkadotJson = account.toJson()
  const phalaSs58Address = polkadotJson.address

  let record = (await Machine.findAndLoad({ publicKey }))[0]

  if (record) {
    $logger.info('Found previous record for this account, updating existing record...')
  } else {
    record = new Machine()
    $logger.info('Creating new record...')
  }

  record.property({
    nickname,
    phalaSs58Address,
    publicKey,
    polkadotJson,
    runtimeEndpoint
  })

  await record.save()

  $logger.info({
    id: record.id,
    nickname,
    phalaSs58Address,
    publicKey,
    runtimeEndpoint
  }, 'Successfully set.')
  process.exit(0)
}

export default setMachine

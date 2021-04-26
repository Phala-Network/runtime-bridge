import { start as startOttoman } from '../utils/couchbase'
import { getModel } from 'ottoman'
import { Keyring } from '@polkadot/keyring'
import { PHALA_SS58_FORMAT } from '../utils/constants'
import { mnemonicGenerate } from '@polkadot/util-crypto'

const keyring = new Keyring({ type: 'sr25519', ss58Format: PHALA_SS58_FORMAT })

const main = async () => {
  await startOttoman(process.env.COUCHBASE_ENDPOINT)
  const Machine = getModel('Machine')
  const mnemonic = mnemonicGenerate()
  const pair = keyring.createFromUri(mnemonic)

  const { publicKey, address: phalaSs58Address } = pair
  const polkadotJson = JSON.stringify({
    publicKey: Array.from(publicKey),
    phalaSs58Address,
    mnemonic,
    pair: pair.toJson(),
  })

  const m = await Machine.create({
    nickname: process.env.M_NICKNAME,
    payoutAddress: process.env.M_PAYOUT_ADDRESS,
    runtimeEndpoint: process.env.M_RUNTIME_ENDPOINT,
    phalaSs58Address,
    polkadotJson,
  })
  console.log(JSON.stringify(m))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

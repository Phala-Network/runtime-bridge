import { Keyring } from '@polkadot/keyring'
import { PHALA_SS58_FORMAT } from '../utils/constants'
import { getModel } from 'ottoman'
import { mnemonicGenerate } from '@polkadot/util-crypto'
import { start as startOttoman } from '../utils/couchbase'

const keyring = new Keyring({ type: 'sr25519', ss58Format: PHALA_SS58_FORMAT })

const main = async ({ couchbaseEndpoint, machines }) => {
  await startOttoman(couchbaseEndpoint)
  const Machine = getModel('Machine')

  const result = []

  const createMachine = async (machine) => {
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
      nickname: machine.nickname,
      payoutAddress: machine.payoutAddress,
      runtimeEndpoint: machine.runtimeEndpoint,
      phalaSs58Address,
      polkadotJson,
    })
    await m.save()
    return m
  }

  for (const machine of machines) {
    result.push(await createMachine(machine))
  }

  console.log(JSON.stringify(result))
}

try {
  let meta = ''
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read()
    if (chunk) {
      meta += chunk
    }
  })

  process.stdin.on('end', async () => {
    await main(JSON.parse(meta))
    process.exit(0)
  })
} catch (error) {
  console.log(error)
  process.exit(255)
}

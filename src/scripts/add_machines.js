import { DB_WORKER, setupDb } from '../io/db'
import { Keyring } from '@polkadot/keyring'
import { PHALA_SS58_FORMAT } from '../utils/constants'
import { mnemonicGenerate } from '@polkadot/util-crypto'
import { setWorker, validateWorkerInput } from '../io/worker'
import { v4 as uuidv4 } from 'uuid'

const keyring = new Keyring({ type: 'sr25519', ss58Format: PHALA_SS58_FORMAT })

const main = async ({ machines }) => {
  await setupDb([DB_WORKER])

  const result = []

  const createMachine = async (machine) => {
    const mnemonic = machine.mnemonic || mnemonicGenerate()
    const pair = keyring.createFromUri(mnemonic)

    const { publicKey, address: phalaSs58Address } = pair
    const polkadotJson = JSON.stringify({
      publicKey: Array.from(publicKey),
      phalaSs58Address,
      mnemonic,
      pair: pair.toJson(),
    })

    const m = {
      id: uuidv4(),
      nickname: machine.nickname,
      payoutAddress: machine.payoutAddress,
      runtimeEndpoint: machine.runtimeEndpoint,
      phalaSs58Address,
      polkadotJson,
    }
    await validateWorkerInput(m)
    await setWorker(m)
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

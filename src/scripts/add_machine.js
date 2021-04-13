#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await
import pnp from '../../.pnp.cjs'
pnp.setup()
import { start as startOttoman } from '@/utils/couchbase'
import { getModel } from 'ottoman'
import { Keyring } from '@polkadot/keyring'

const keyring = new Keyring()

const main = async () => {
  await startOttoman(process.env.COUCHBASE_ENDPOINT)
  const Machine = getModel('Machine')

  const m = await Machine.create({
    nickname: process.env.M_NICKNAME,
    payoutAddress: process.env.M_PAYOUT_ADDRESS,
    runtimeEndpoint: process.env.M_RUNTIME_ENDPOINT,
  })
  console.log(m.id)
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

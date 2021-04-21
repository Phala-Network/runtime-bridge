#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await

import { start as startOttoman } from '../utils/couchbase'
import { getModel } from 'ottoman'

const main = async () => {
  await startOttoman('couchbase://couchbase/phala@phala:phalaphala')
  const Machine = getModel('Machine')

  const data = {
    nickname: 'test',
    payoutAddress: '44FjUvzD24vvKaAFx4mCgNTeUZ1D5LJgHsPpCP5qgrGUpyg9',
    runtimeEndpoint: 'http://10.96.89.137:8000',
    phalaSs58Address: '46EmmKpsUBRtj6An5ytqxay62Qu6bEBnzHNkSvmGHxNoj6jk',
    polkadotJson:
      '{"publicKey":[248,158,171,10,85,178,217,85,82,138,35,170,48,186,193,121,177,251,149,224,89,74,66,204,204,78,23,156,235,88,57,118],"phalaSs58Address":"46EmmKpsUBRtj6An5ytqxay62Qu6bEBnzHNkSvmGHxNoj6jk","mnemonic":"vault choose snack close butter neglect access moral game fatigue vote amateur","pair":{"encoded":"MFMCAQEwBQYDK2VwBCIEICD6wmK1E8pfNzqLJ+8nvlu+WLmnaKla8yhAL+fOMDVszlIPG4pJP/6XJtWHt5GqGAhl5UqL9vJQetAky+B9zpOhIwMhAPieqwpVstlVUoojqjC6wXmx+5XgWUpCzMxOF5zrWDl2","encoding":{"content":["pkcs8","sr25519"],"type":["none"],"version":"3"},"address":"46EmmKpsUBRtj6An5ytqxay62Qu6bEBnzHNkSvmGHxNoj6jk","meta":{}}}',
  }
  const m = await Machine.create(data)
  console.log(JSON.stringify(m))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}

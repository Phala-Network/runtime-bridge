import { PHALA_SS58_FORMAT } from '@/utils/constants'
import { Keyring } from '@polkadot/keyring'
import { cryptoWaitReady } from '@polkadot/util-crypto'

const createKeyring = async () => {
  await cryptoWaitReady()
  return new Keyring({
    type: 'sr25519',
    ss58Format: PHALA_SS58_FORMAT
  })
}

export default createKeyring

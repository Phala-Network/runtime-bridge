import { createPrivateKey, createPublicKey } from 'crypto'
import { peerIdPrefix } from './env'
import PeerId from 'peer-id'
import logger from './logger'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { KeyObject } from 'crypto'

export const DATA_PROVIDER = Symbol('DATA_PROVIDER')
export const DATA_PROVIDER_EXT = Symbol('DATA_PROVIDER_EXT')
export const LIFECYCLE = Symbol('LIFECYCLE')
export const TRADE = Symbol('TRADE')

export const KEY_SYMBOLS = [DATA_PROVIDER, LIFECYCLE, TRADE] as const

export const KEY_NAMES = {
  [DATA_PROVIDER]: 'DATA_PROVIDER',
  [DATA_PROVIDER_EXT]: 'DATA_PROVIDER_EXT',
  [LIFECYCLE]: 'LIFECYCLE',
  [TRADE]: 'TRADE',
}

export type PeerKeySymbol = typeof KEY_SYMBOLS[number]

export type PrbPeerId = PeerId & {
  privKeyObj: KeyObject
  pubKeyObj: KeyObject
}

const createAndWriteMyId = async (sym: PeerKeySymbol) => {
  const fullPath = path.join(peerIdPrefix, KEY_NAMES[sym])
  const key = await PeerId.create({
    bits: 2048,
    keyType: 'RSA',
  })
  await fs.mkdir(peerIdPrefix, { recursive: true })
  await fs.writeFile(fullPath, key.marshal(false))
  return key
}
const readMyId = async (sym: PeerKeySymbol) => {
  const fullPath = path.join(peerIdPrefix, KEY_NAMES[sym])
  const buffer = await fs.readFile(fullPath)
  return PeerId.createFromProtobuf(buffer)
}
const _getMyId = (sym: PeerKeySymbol) =>
  readMyId(sym).catch((e) => {
    if (e.code === 'ENOENT') {
      return createAndWriteMyId(sym)
    } else {
      throw e
    }
  })

export const getMyId = async (sym: PeerKeySymbol): Promise<PrbPeerId> => {
  const raw = await _getMyId(sym)
  logger.info(
    { id: raw.toB58String() },
    `Got my peer id as ${sym.description}.`
  )
  const privKeyObj = createPrivateKey({
    key: await raw.privKey.export('0'),
    type: 'pkcs8',
    passphrase: '0',
  })
  const pubKeyObj = createPublicKey(privKeyObj)
  return Object.assign(raw, {
    privKeyObj,
    pubKeyObj,
  })
}

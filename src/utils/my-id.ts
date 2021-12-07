import { peerIdPrefix } from './env'
import PeerId from 'peer-id'
import * as fs from 'fs/promises'
import * as path from 'path'

export const DATA_PROVIDER = Symbol('DATA_PROVIDER')
export const LIFECYCLE = Symbol('LIFECYCLE')
export const TRADE = Symbol('TRADE')

export const KEY_SYMBOLS = [DATA_PROVIDER, LIFECYCLE, TRADE] as const

export const KEY_NAMES = {
  [DATA_PROVIDER]: 'DATA_PROVIDER',
  [LIFECYCLE]: 'LIFECYCLE',
  [TRADE]: 'TRADE',
}

export type PeerKeySymbol = typeof KEY_SYMBOLS[number]

const createAndWriteMyId = async (sym: PeerKeySymbol) => {
  const fullPath = path.join(peerIdPrefix, KEY_NAMES[sym])
  const key = await PeerId.create({
    bits: 256,
    keyType: 'Ed25519',
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
export const getMyId = (sym: PeerKeySymbol) =>
  readMyId(sym).catch((e) => {
    if (e.code === 'ENOENT') {
      return createAndWriteMyId(sym)
    } else {
      throw e
    }
  })

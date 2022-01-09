import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  IsUUID,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import { Field, Type } from 'protobufjs'
import {
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'crypto'
import { keyring } from '../../utils/api'
import Worker from './worker_model'
import type { KeyringPair } from '@polkadot/keyring/types'
import type { PrbPeerId } from '../../utils/my-id'
import type { prb } from '@phala/runtime-bridge-walkie'

const EncPb = new Type('EncPb')
  .add(new Field('iv', 1, 'bytes'))
  .add(new Field('key', 2, 'bytes'))
  .add(new Field('payload', 3, 'bytes'))

type EncPb = {
  iv: Buffer
  key: Buffer
  payload: Buffer
}

@Table({
  modelName: 'pool',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['pid'],
    },
    {
      unique: true,
      fields: ['name'],
    },
    {
      fields: ['enabled'],
    },
  ],
})
class Pool extends Model {
  @IsUUID(4)
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string

  @AllowNull(false)
  @Unique
  @Column
  pid: number

  @AllowNull(false)
  @Unique
  @Column
  name: string

  @AllowNull
  @Column
  proxiedAccountSs58: string

  @AllowNull(false)
  @Column
  encryptedOperator: Buffer

  @Default(true)
  @Column
  enabled: boolean

  @HasMany(() => Worker)
  workers: Worker[]

  #_decryptedOperatorKey: KeyringPair = null

  static myId: PrbPeerId

  decryptOperatorKey() {
    const pb = EncPb.decode(this.encryptedOperator) as unknown as EncPb
    const { iv, key, payload } = pb
    const rawKey = privateDecrypt(Pool.myId.privKeyObj, key)

    const decipher = createDecipheriv('aes-256-cbc', rawKey, iv)
    this.#_decryptedOperatorKey = keyring.addFromJson(
      JSON.parse(
        Buffer.concat([decipher.update(payload), decipher.final()]).toString(
          'utf-8'
        )
      )
    )
    return this.#_decryptedOperatorKey
  }

  get isProxy() {
    return !!this.proxiedAccountSs58
  }

  set operatorMnemonic(mnemonic: string) {
    this.operator = keyring.addFromMnemonic(mnemonic)
  }

  get operatorMnemonic(): null {
    throw new Error("Exporting operator's mnemonic is forbidden!")
  }

  set operator(keyringPair) {
    const iv = randomBytes(16)

    const rawKey = randomBytes(32)
    const key = publicEncrypt(
      {
        key: Pool.myId.pubKeyObj,
      },
      rawKey
    )
    const cipher = createCipheriv('aes-256-cbc', rawKey, iv)

    const payload = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(keyringPair.toJson()))),
      cipher.final(),
    ])
    const pb = EncPb.create({
      iv,
      key,
      payload,
    })

    this.encryptedOperator = Buffer.from(EncPb.encode(pb).finish())
    this.#_decryptedOperatorKey = keyringPair
  }

  get operator() {
    if (!this.#_decryptedOperatorKey) {
      return this.decryptOperatorKey()
    }
    return this.#_decryptedOperatorKey
  }

  get pair() {
    return this.operator
  }

  toPbInterface(): prb.db.IPool {
    return {
      uuid: this.id,
      owner: {
        polkadotJson: this.encryptedOperator.toString('hex'),
        ss58Phala: this.operator.address,
        ss58Polkadot: keyring.encodeAddress(this.operator.publicKey, 0),
      },
      pid: this.pid,
      name: this.name,
      enabled: this.enabled,
      deleted: false,
      realPhalaSs58: this.proxiedAccountSs58,
    }
  }
}

export type PoolLookupTable = {
  [K: number]: Pool
}

export { Pool }
export default Pool

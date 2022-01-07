import {
  AllowNull,
  Column,
  Default,
  HasMany,
  IsUUID,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import { keyring } from '../../utils/api'
import { privateDecrypt, publicEncrypt } from 'crypto'
import Worker from './worker_model'
import type { KeyringPair } from '@polkadot/keyring/types'
import type { PrbPeerId } from '../../utils/my-id'
import type { prb } from '@phala/runtime-bridge-walkie'

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
  @Column(DataTypes.UUIDV4)
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
    this.#_decryptedOperatorKey = keyring.addFromJson(
      JSON.parse(
        privateDecrypt(Pool.myId.privKeyObj, this.encryptedOperator).toString(
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
    this.encryptedOperator = publicEncrypt(
      Pool.myId.pubKeyObj,
      Buffer.from(JSON.stringify(keyringPair.toJson()))
    )
    this.#_decryptedOperatorKey = keyringPair
  }

  get operator() {
    if (!this.#_decryptedOperatorKey) {
      return this.decryptOperatorKey()
    }
    return this.#_decryptedOperatorKey
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

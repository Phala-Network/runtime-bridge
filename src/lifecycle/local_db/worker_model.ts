import {
  AllowNull,
  BelongsTo,
  Column,
  Default,
  ForeignKey,
  IsUUID,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import Pool from './pool_model'
import type { prb } from '@phala/runtime-bridge-walkie'

@Table({
  modelName: 'worker',
  timestamps: true,
  indexes: [
    {
      fields: ['poolId'],
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
class Worker extends Model {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataTypes.UUIDV4)
  id: string

  @Unique
  @AllowNull(false)
  @Column
  name: string

  @AllowNull(false)
  @Column
  endpoint: string

  @AllowNull(false)
  @Column
  stake: string

  @Default(true)
  @Column
  enabled: boolean

  @ForeignKey(() => Pool) poolId: string
  @BelongsTo(() => Pool) pool: Pool

  toPbInterface(): prb.db.IWorker {
    return {
      uuid: this.id,
      pid: this.pool.pid,
      name: this.name,
      endpoint: this.endpoint,
      enabled: this.enabled,
      deleted: false,
      stake: this.stake,
    }
  }
}

export { Worker }
export default Worker

import { DataTypes, Model } from 'sequelize'
import type { HasMany, Sequelize } from 'sequelize'
import type Worker from './worker_model'

export class Pool extends Model {
  static Worker: HasMany<Pool, Worker>
}
export const initPoolModel = (db: Sequelize) =>
  Pool.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        autoIncrement: false,
        primaryKey: true,
      },
      pid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      proxiedAccountSs58: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      encryptedOperator: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize: db,
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
    }
  )

export default Pool

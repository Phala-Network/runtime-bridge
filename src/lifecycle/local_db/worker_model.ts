import { DataTypes, Model } from 'sequelize'
import type { BelongsTo, Sequelize } from 'sequelize'
import type Pool from './pool_model'

export class Worker extends Model {
  static Pool: BelongsTo<Worker, Pool>
}

export const initWorkerModel = (db: Sequelize) =>
  Worker.init(
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
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      endpoint: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stake: {
        type: DataTypes.STRING,
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
      modelName: 'worker',
      timestamps: true,
      indexes: [
        {
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

export default Worker

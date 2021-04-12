import { Schema } from 'ottoman'

const WorkerStateSchema = new Schema({
  workerId: {
    type: String,
    require: true,
  },
  status: {
    type: String,
    enum: [
      'S_IDLE',
      'S_STARTING',
      'S_PENDING_SYNCHING',
      'S_SYNCHING',
      'S_ONLINE',
      'S_KICKED',
      'S_ERROR',
    ],
    default: 'S_IDLE',
  },
  latestSynchedHeaderPhala: {
    type: Number,
    default: -1,
  },
  latestSynchedHeaderRococo: {
    type: Number,
    default: -1,
  },
  latestSynchedBlock: {
    type: Number,
    default: -1,
  },
  initialized: {
    type: String,
    default: false,
  },
  balance: {
    value: {
      type: String,
    },
  },
  payoutAddress: String,
  intention: {
    type: Boolean,
    default: false,
  },
})

WorkerStateSchema.index.findRefWorkerId = {
  by: 'workerId',
  type: 'n1ql',
}

WorkerStateSchema.index.findRefStatus = {
  by: 'status',
  type: 'n1ql',
}

WorkerStateSchema.index.findRefInitialized = {
  by: 'initialized',
  type: 'n1ql',
}

export default WorkerStateSchema

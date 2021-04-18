import { Schema } from 'ottoman'

const RuntimeWindowSchema = new Schema({
  startBlock: Number,
  stopBlock: Number,
  currentBlock: Number,
  windowId: Number,
  setId: Number,
  finished: { type: Boolean, default: false },
})

RuntimeWindowSchema.index.findByStartBlock = { by: 'startBlock', type: 'n1ql' }
RuntimeWindowSchema.index.findByRefBlock = { by: 'stopBlock', type: 'n1ql' }
RuntimeWindowSchema.index.findRefFinished = { by: 'finished', type: 'n1ql' }
RuntimeWindowSchema.index.findN1qlByFinishedAndWindowId = {
  by: ['windowId', 'finished'],
  type: 'n1ql',
}
RuntimeWindowSchema.index.findN1qlByWindowId = { by: 'windowId', type: 'n1ql' }

export default RuntimeWindowSchema

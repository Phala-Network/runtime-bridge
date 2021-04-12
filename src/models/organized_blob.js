import { Schema } from 'ottoman'

const OrganizedBlobSchema = new Schema({
  startBlock: Number,
  stopBlock: Number,
  windowId: Number,
  syncHeaderBlob: String,
  dispatchBlockBlob: String,
  genesisInfoBlob: String,
  fullBlob: { type: Boolean, default: false },
  number: Number,
})

OrganizedBlobSchema.index.findByStartBlock = { by: 'startBlock', type: 'view' }
OrganizedBlobSchema.index.findByStopBlock = { by: 'stopBlock', type: 'view' }
OrganizedBlobSchema.index.findByWindowId = { by: 'windowId', type: 'view' }
OrganizedBlobSchema.index.findN1qlByWindowId = { by: 'windowId', type: 'n1ql' }
OrganizedBlobSchema.index.findN1qlByFullBlob = { by: 'fullBlob', type: 'n1ql' }
OrganizedBlobSchema.index.findN1qlByBlock = {
  by: ['startBlock', 'stopBlock'],
  type: 'n1ql',
}
OrganizedBlobSchema.index.findN1qlByStartBlock = {
  by: ['startBlock'],
  type: 'n1ql',
}
OrganizedBlobSchema.index.findN1qlByNumber = { by: 'number', type: 'n1ql' }

export default OrganizedBlobSchema

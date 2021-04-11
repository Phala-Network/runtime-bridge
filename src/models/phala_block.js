import { Schema } from 'ottoman'

const PhalaBlockSchema = new Schema({
  number: { type: Number, required: true },
  hash: { type: String, required: true },
  header: String,
  justification: String,
  events: String,
  eventsStorageProof: String,
  grandpaAuthorities: String,
  grandpaAuthoritiesStorageProof: String,
  setId: Number,
})

PhalaBlockSchema.index.findN1qlByNumber = { by: 'number', type: 'n1ql' }
PhalaBlockSchema.index.findRefNumber = { by: 'number', type: 'refdoc' }
PhalaBlockSchema.index.findRefHash = { by: 'hash', type: 'refdoc' }

export default PhalaBlockSchema

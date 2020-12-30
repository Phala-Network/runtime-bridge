import { Nohm } from "nohm"

const OrganizedBlob = Nohm.model('OrganizedBlob', {
	properties: {
		startBlock: {
			type: 'integer',
			unique: true,
			index: true
    },
    stopBlock: {
			type: 'integer',
			unique: false,
			index: true
		},
		windowId: {
			type: 'integer',
			unique: false,
			index: true
		},
    syncHeaderBlob: {
			type: 'string',
			unique: false,
			index: false
		},
		dispatchBlockBlob: {
			type: 'string',
			unique: false,
			index: false
		},
		genesisInfoBlob: {
			type: 'string',
			unique: false,
			index: false
		}
	}
})

export default OrganizedBlob

import { Nohm } from "nohm"

const RuntimeWindow = Nohm.model('RuntimeWindow', {
	properties: {
		startBlock: {
			type: 'integer',
			unique: true,
			index: true
    },
    stopBlock: {
			type: 'integer',
			unique: false,
			index: false
		},
		currentBlock: {
			type: 'integer',
			unique: false,
			index: false
		},
		setId: {
			type: 'integer',
			unique: false,
			index: false
		},
    finished: {
			defaultValue: false,
			type: 'boolean',
			unique: false,
			index: true
		},
	}
})

export default RuntimeWindow

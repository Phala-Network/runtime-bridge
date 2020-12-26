import { Nohm } from "nohm";

const PhalaEvent = Nohm.model('PhalaEvent', {
	properties: {
		blockNumber: {
			type: 'integer',
			unique: false,
			index: true
    },
    typeIndex: {
			type: 'integer',
			unique: false,
			index: true
		},
		hash: {
			type: 'string',
			unique: true,
			index: true,
			validations: ['notEmpty']
    },
		header: {
			type: 'string',
			unique: false,
			index: false,
			validations: ['notEmpty']
		},
		blob: {
			type: 'string',
			unique: false,
			index: false,
		}
	}
})

export default PhalaEvent

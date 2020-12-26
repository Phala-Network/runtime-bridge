import { Nohm } from "nohm";

const PhalaBlock = Nohm.model('PhalaBlock', {
	properties: {
		number: {
			type: 'integer',
			unique: true,
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
			index: false
		},
		justification: {
			type: 'string',
			unique: false,
			index: false,
		},
		events: {
			type: 'string',
			unique: false,
			index: false,
		},
		eventsStorageProof: {
			type: 'string',
			unique: false,
			index: false,
		},
		grandpaAuthorities: {
			type: 'string',
			unique: false,
			index: false,
		},
		grandpaAuthoritiesStorageProof: {
			type: 'string',
			unique: false,
			index: false,
		}
	}
})

export default PhalaBlock

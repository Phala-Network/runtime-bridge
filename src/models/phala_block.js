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
			index: false,
			validations: ['notEmpty']
		},
		hasJustification: {
			type: 'boolean'
		}
	}
})

export default PhalaBlock

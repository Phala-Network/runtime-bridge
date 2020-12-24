import { Nohm } from "nohm";

const Block = Nohm.model('Block', {
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
		blob: {
			type: 'string',
			unique: false,
			index: false,
			validations: ['notEmpty']
		}
	}
})

export default Block

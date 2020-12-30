export const APP_VERIFIED_HEIGHT = 'APP_VERIFIED_HEIGHT'
export const APP_VERIFIED_WINDOW_ID = 'APP_VERIFIED_WINDOW_ID'
export const APP_LATEST_BLOB_ID = 'APP_LATEST_BLOB_ID'

export const PHALA_CHAIN_NAME = 'PHALA_CHAIN_NAME'

export const EVENTS_STORAGE_KEY = 'EVENTS_STORAGE_KEY'
export const GRANDPA_AUTHORITIES_KEY = ':grandpa_authorities'

export const SYNC_HEADER_REQ_EMPTY = Object.freeze({
	headers_b64: null,
	authority_set_change_b64: null,
	headers: null,
	authoritySetChange: null
})
export const DISPATCH_BLOCK_REQ_EMPTY = Object.freeze({
	blocks_b64: null,
	blocks: null
})

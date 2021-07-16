import BN from 'bn.js'

export const APP_RECEIVED_HEIGHT = 'APP_RECEIVED_HEIGHT'
export const APP_VERIFIED_HEIGHT = 'APP_VERIFIED_HEIGHT'
export const APP_VERIFIED_WINDOW_ID = 'APP_VERIFIED_WINDOW_ID'
export const APP_LATEST_BLOB_ID = 'APP_LATEST_BLOB_ID'

export const FETCH_SHOULD_START = 'FETCH_SHOULD_START'
export const FETCH_PROCESSED_BLOB = 'FETCH_PROCESSED_BLOB'
export const FETCH_IS_SYNCHED = 'FETCH_IS_SYNCHED'

export const PHALA_CHAIN_NAME = 'PHALA_CHAIN_NAME'
export const PHALA_ZERO_ACCOUNT =
  '3zcnkmF6XjEogm8vAyPiL2ykPZHpeVtcfDcwTWJ2teqdSvjq'

export const EVENTS_STORAGE_KEY = 'EVENTS_STORAGE_KEY'
export const GRANDPA_AUTHORITIES_KEY = ':grandpa_authorities'

export const SYNC_HEADER_REQ_EMPTY = Object.freeze({
  headers_b64: null,
  authority_set_change_b64: null,
  headers: null,
  authoritySetChange: null,
})
export const DISPATCH_BLOCK_REQ_EMPTY = Object.freeze({
  blocks_b64: null,
  blocks: null,
})

export const PHALA_SS58_FORMAT = 30
export const ROCOCO_SS58_FORMAT = 42

export const APP_MESSAGE_QUEUE_NAME = 'prbmq'
export const APP_MESSAGE_TUNNEL_CHANNEL = Buffer.from('prb')
export const APP_MESSAGE_TUNNEL_QUERY_TIMEOUT = 15000

export const FRNK = '0x46524e4b'
export const BALANCE_10K_PHA_STRING = '10000000000000000'
export const BALANCE_10K_PHA = new BN(BALANCE_10K_PHA_STRING)
export const MINIUM_BALANCE_STRING = BALANCE_10K_PHA_STRING
export const MINIUM_BALANCE = BALANCE_10K_PHA

export const TX_QUEUE_SIZE = 200
export const BLOB_MAX_RANGE_COUNT = 450

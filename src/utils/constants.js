import BN from 'bn.js'
import Decimal from 'decimal.js'

export const FETCH_PROCESSED_BLOB = 'FETCH_PROCESSED_BLOB'
export const LAST_COMMITTED_PARA_BLOCK = 'LAST_COMMITTED_PARA_BLOCK'
export const LAST_COMMITTED_PARENT_BLOCK = 'LAST_COMMITTED_PARENT_BLOCK'

export const PHALA_CHAIN_NAME = 'PHALA_CHAIN_NAME'
export const PHALA_ZERO_ACCOUNT =
  '3zcnkmF6XjEogm8vAyPiL2ykPZHpeVtcfDcwTWJ2teqdSvjq'

export const EVENTS_STORAGE_KEY = 'EVENTS_STORAGE_KEY'
export const GRANDPA_AUTHORITIES_KEY = ':grandpa_authorities'
export const EVENT_INDEX_NEW_SESSION = '0x0900'

export const PHALA_SS58_FORMAT = 30
export const ROCOCO_SS58_FORMAT = 42

export const APP_MESSAGE_QUEUE_NAME = 'prbmq'
export const APP_MESSAGE_TUNNEL_CHANNEL = Buffer.from('prb')
export const APP_MESSAGE_TUNNEL_QUERY_TIMEOUT = 15000

export const FRNK = '0x46524e4b'

export const TX_QUEUE_SIZE = 320
export const TX_SEND_QUEUE_SIZE = 50
export const TX_TIMEOUT = 8 * 60 * 60 * 1000 // TODO: temp fix, remove later!

export const BLOB_MAX_RANGE_COUNT = 900
export const BLOB_MAX_PARA_BLOCK_RANGE_COUNT = 300

export const MIN_SYNCHED_DISTANCE = 3

export const BN_1PHA = new BN('1000000000000')

export const PRPC_QUEUE_SIZE = 32768

export const MINER_V_BASE = new Decimal(2).pow(64)

import { typesChain } from '@phala/typedefs'

export const chainTypes = typesChain['Phala Development']
export const bridgeTypes = {
  StorageProof: 'Vec<Vec<u8>>',
  VersionedAuthorityList: {
    version: 'u8',
    authorityList: 'AuthorityList',
  },
  AuthoritySet: {
    authoritySet: 'AuthorityList',
    setId: 'SetId',
  },
  AuthoritySetChange: {
    authoritySet: 'AuthoritySet',
    authorityProof: 'StorageProof',
  },
  JustificationToSync: 'Option<EncodedJustification>',
  HeaderToSync: {
    header: 'Header',
    justification: 'JustificationToSync',
  },
  GenesisInfo: {
    header: 'Header',
    validators: 'AuthorityList',
    proof: 'StorageProof',
  },
  BlockHeaderWithEvents: {
    blockHeader: 'Header',
    storageChanges: 'StorageChanges',
  },
  EncodedU8StorageKey: 'Vec<u8>',
  OnlineWorkerSnapshot: {
    workerStateKv: 'Vec<(EncodedU8StorageKey, WorkerInfo)>',
    stakeReceivedKv: 'Vec<(EncodedU8StorageKey, Balance)>',
    onlineWorkersKv: '(EncodedU8StorageKey, u32)',
    computeWorkersKv: '(EncodedU8StorageKey, u32)',
    proof: 'StorageProof',
  },
  // PalletId: 'Raw',
  // StashWorkerStats: {
  //   slash: 'Balance',
  //   computeReceived: 'Balance',
  //   onlineReceived: 'Balance',
  // },
  // SignedWorkerMessage: {
  //   data: 'WorkerMessage',
  //   signature: 'Vec<u8>',
  // },
  // WorkerMessage: {
  //   payload: 'WorkerMessagePayload',
  //   sequence: 'u64',
  // },
  // WorkerMessagePayload: {
  //   _enum: {
  //     Heartbeat: 'WorkerMessagePayloadHeartbeat',
  //   },
  // },
  // WorkerMessagePayloadHeartbeat: {
  //   blockNum: 'u32',
  //   claimOnline: 'bool',
  //   claimCompute: 'bool',
  // },
  StorageCollection: 'Vec<(Vec<u8>, Option<Vec<u8>>)>',
  ChildStorageCollection: 'Vec<(Vec<u8>, StorageCollection)>',
  StorageChanges: {
    mainStorageChanges: 'StorageCollection',
    childStorageChanges: 'ChildStorageCollection',
  },
}

export const phalaTypes = {
  ...chainTypes,
  ...bridgeTypes,
}

export default phalaTypes

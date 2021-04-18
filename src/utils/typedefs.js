import { typesChain } from '@phala/typedefs'

export const chainTypes = typesChain['Phala PoC-4']
export const bridgeTypes = {
  SetId: 'u64',
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
  ReqHeaderToSync: {
    header: 'Header',
    justification: 'Option<EncodedJustification>',
  },
  ReqGenesisInfo: {
    header: 'Header',
    validators: 'AuthorityList',
    proof: 'StorageProof',
  },
  ReqBlockHeaderWithEvents: {
    blockHeader: 'Header',
    events: 'Option<Vec<u8>>',
    proof: 'Option<StorageProof>',
    workerSnapshot: 'Option<OnlineWorkerSnapshot>',
  },
  StorageKey: 'Vec<u8>',
  OnlineWorkerSnapshot: {
    workerStateKv: 'Vec<(StorageKey, WorkerInfo)>',
    stakeReceivedKv: 'Vec<(StorageKey, Balance)>',
    onlineWorkersKv: '(StorageKey,u32)',
    computeWorkersKv: '(StorageKey,u32)',
    proof: 'StorageProof',
  },
  // PalletId: 'Raw',
  StashWorkerStats: {
    slash: 'Balance',
    computeReceived: 'Balance',
    onlineReceived: 'Balance',
  },
}

export const phalaTypes = {
  ...chainTypes,
  ...bridgeTypes,
}

export default phalaTypes

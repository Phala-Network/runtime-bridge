import { khalaDev } from '@phala/typedefs'

export const chainTypes = khalaDev
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
  BlockHeaderWithChanges: {
    blockHeader: 'Header',
    storageChanges: 'StorageChanges',
  },
  StorageCollection: 'Vec<(Vec<u8>, Option<Vec<u8>>)>',
  ChildStorageCollection: 'Vec<(Vec<u8>, StorageCollection)>',
  StorageChanges: {
    mainStorageChanges: 'StorageCollection',
    childStorageChanges: 'ChildStorageCollection',
  },
  SyncHeaderReq: {
    headers: 'Vec<HeaderToSync>',
    authoritySetChange: 'Option<AuthoritySetChange>',
  },
  SyncParachainHeaderReq: {
    headers: 'Vec<Header>',
    proof: 'StorageProof',
  },
  DispatchBlockReq: {
    blocks: 'Vec<BlockHeaderWithChanges>',
  },
  GenesisInfo: {
    header: 'Header',
    validators: 'AuthorityList',
    proof: 'StorageProof',
  },
  SyncCombinedHeadersReq: {
    relaychainHeaders: 'Vec<HeaderToSync>',
    authoritySetChange: 'Option<AuthoritySetChange>',
    parachainHeaders: 'Vec<Header>',
    proof: 'StorageProof',
  },
  EgressMessages: 'Vec<(MessageOrigin, Vec<SignedMessage>)>',
}

const localOverrides = {
  WorkerInfo: {
    pubkey: 'WorkerPublicKey',
    ecdhPubkey: 'EcdhPublicKey',
    runtimeVersion: 'u32',
    lastUpdated: 'u64',
    operator: 'Option<AccountId>',
    confidenceLevel: 'u8',
    initialScore: 'Option<u32>',
    features: 'Vec<u32>',
  },
}

export const phalaTypes = {
  ...chainTypes,
  ...bridgeTypes,
  ...localOverrides,
}

export default phalaTypes

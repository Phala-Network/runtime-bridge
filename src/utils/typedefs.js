import { typesChain } from '@phala/typedefs'

export const chainTypes = typesChain['Khala Testnet']
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
}

export const phalaTypes = {
  ...chainTypes,
  ...bridgeTypes,
}

export default phalaTypes

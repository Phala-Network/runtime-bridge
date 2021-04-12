import _phalaTypes from '@phala/typedefs'

export const chainTypes = _phalaTypes.typesChain['Phala PoC-4']
export const bridgeTypes = {
  SetId: 'u64',
  Justification: 'Vec<u8>',
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
    justification: 'Option<Justification>',
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
    key: 'Option<Vec<u8>>',
  },
  PalletId: 'Raw',
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

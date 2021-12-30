declare module 'libp2p-mplex' {
  import { MuxerFactory } from 'libp2p-interfaces/src/stream-muxer/types'
  declare const libp2p__mplex: MuxerFactory
  export default libp2p__mplex
}

declare module 'libp2p-mdns' {
  import { PeerDiscoveryFactory } from 'libp2p-interfaces/src/peer-discovery/types'
  declare const libp2p__mdns: PeerDiscoveryFactory
  export default libp2p__mdns
}

declare module 'redis-commands' {
  import type { Commands } from 'ioredis'
  export type Command = keyof Commands
  declare const list: Command[]
  export { list }
}

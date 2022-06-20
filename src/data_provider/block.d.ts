import { prb } from '@phala/runtime-bridge-walkie'
import IGenesis = prb.db.IGenesis
import IParaBlock = prb.db.IParaBlock
import IParentBlock = prb.db.IParentBlock

declare const processGenesis: () => Promise<IGenesis>
declare const _processGenesis: (paraId: number) => Promise<IGenesis>
declare const walkParaBlock: (
  paraBlockNumber: number,
  lastHeaderHashHex?: string | void
) => Promise<string | null>
declare const walkParentBlock: (
  parentBlockNumber: number,
  paraId: number,
  proofKey: string
) => Promise<IParentBlock>

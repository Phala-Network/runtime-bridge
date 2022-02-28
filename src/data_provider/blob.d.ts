export type AnyObject = { [k: string]: unknown }
export type BlockList = AnyObject[]

declare const walkParaBlock: (number: number) => Promise<void>

declare const walkWindow: (
  number: number,
  lastWindow?: AnyObject | null
) => Promise<AnyObject>

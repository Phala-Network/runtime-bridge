import { crc32c } from '@node-rs/crc32'

export const crc32cBuffer = (input: Buffer | string) => {
  const crcNum = crc32c(input)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(crcNum), 0)
  return buf
}

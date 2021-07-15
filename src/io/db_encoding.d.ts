import type { CodecEncoder, CodecOptions } from 'level-codec'

export interface CodecOptionCreator {
  (
    keyEncoding: string | CodecEncoder,
    valueEncoding: string | CodecEncoder,
    options: unknown
  ): CodecOptions
}

export const formEncodingOptions: CodecOptionCreator
export const formEncodingOptions__freeze: CodecOptionCreator

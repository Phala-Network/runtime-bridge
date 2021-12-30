import type { IConversionOptions, Message } from 'protobufjs'

export const DB_PB_TO_OBJECT_OPTIONS = {
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true,
  json: true,
}

export const pbToObject = <T extends typeof Message>(
  pb: InstanceType<T>,
  options: IConversionOptions & {
    Type?: T
  } = {}
) => {
  const _t = options.Type || (pb.constructor as unknown as T)
  const ret = _t.toObject(pb, {
    ...DB_PB_TO_OBJECT_OPTIONS,
    ...options,
  } as IConversionOptions)
  for (const key in ret) {
    if (Buffer.isBuffer(ret[key])) {
      if (!ret[key].length) {
        ret[key] = undefined
      }
    }
  }
  return ret
}

export const formEncodingOptions = (keyEncoding, valueEncoding, options = {}) =>
  Object.assign(options, { keyEncoding, valueEncoding })

export const formEncodingOptions__freeze = (...args) =>
  Object.freeze(formEncodingOptions(...args))

export const DB_ENCODING_JSON = formEncodingOptions__freeze('utf8', 'json')
export const DB_ENCODING_SCALE_HEX = formEncodingOptions__freeze('utf8', 'utf8')
export const DB_ENCODING_BINARY = formEncodingOptions__freeze('utf8', 'binary')
export const DB_ENCODING_DEFAULT = DB_ENCODING_BINARY

export const DB_PB_TO_OBJECT_OPTIONS = {
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true,
  json: true,
}
export const pbToObject = (pb, options = {}) => {
  const Type = options.Type || pb.constructor
  const ret = Type.toObject(pb, { ...DB_PB_TO_OBJECT_OPTIONS, ...options })
  for (const key in ret) {
    if (Buffer.isBuffer(ret[key])) {
      if (!ret[key].length) {
        ret[key] = undefined
      }
    }
  }
  return ret
}

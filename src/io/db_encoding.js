export const formEncodingOptions = (keyEncoding, valueEncoding, options = {}) =>
  Object.assign(options, { keyEncoding, valueEncoding })

export const formEncodingOptions__freeze = (...args) =>
  Object.freeze(formEncodingOptions(...args))

export const DB_ENCODING_DEFAULT = formEncodingOptions__freeze('utf8', 'json')
export const DB_ENCODING_SCALE_HEX = formEncodingOptions__freeze('utf8', 'utf8')
export const DB_ENCODING_BINARY = formEncodingOptions__freeze('utf8', 'binary')

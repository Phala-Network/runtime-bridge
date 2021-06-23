const toEnum = (arr) => {
  const ret = {}
  arr.forEach((i, idx) => {
    ret[i] = i
    ret[idx] = i
  })
  return ret
}

export default toEnum

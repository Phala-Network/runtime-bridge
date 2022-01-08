const toEnum = (arr: string[]) => {
  type Ret = {
    [K in typeof arr[number]]: K
  } & {
    [k: number]: typeof arr[number]
  }
  const ret: Ret = {}
  arr.forEach((i, idx) => {
    ret[i] = i
    ret[idx] = i
  })
  return ret
}

export default toEnum

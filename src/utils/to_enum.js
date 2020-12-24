const toEnum = arr => {
	const ret = {}
	arr.forEach((i, idx) => {
		ret[i] = idx
		ret[idx] = i
	})
	return ret
}

export default toEnum

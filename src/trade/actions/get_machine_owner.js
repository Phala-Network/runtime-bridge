const getMachineOwner = async ({ machineId }, { keyring, api }) => {
  const raw = await api.query.phalaModule.machineOwner(machineId)
  return {
    raw,
    encoded: keyring.encodeAddress(raw)
  }
}

export default getMachineOwner

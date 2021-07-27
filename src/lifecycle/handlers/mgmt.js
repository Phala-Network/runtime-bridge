import { UPool, UWorker } from '../../io/worker'
import { keyring } from '../../utils/api'
import { prb } from '../../message/proto.generated'
import { returnAllWorkers } from './infra'

const requestCreatePool = async (message) => {
  const input = message.content.requestCreatePool.pools
  for (const item of input) {
    const { mnemonic, polkadotJson } = item.owner
    let pair
    if (mnemonic) {
      pair = keyring.addFromMnemonic(mnemonic)
    } else {
      pair = keyring.addFromJson(polkadotJson)
    }
    item.owner = {
      polkadotJson: pair.toJson(),
      ss58Phala: pair.address,
      ss58Polkadot: keyring.encodeAddress(pair.publicKey, 0),
    }
  }
  await UPool.createItems(input)
  return returnAllWorkers()
}
const requestUpdatePool = async (message) => {
  const items = await Promise.all(
    message.content.requestUpdatePool.items.map((item) => {
      const idPb = prb.PoolOrWorkerQueryIdentity.fromObject(item.id)
      const idKey = idPb.identity
      const idValue = idPb[idKey]

      const { mnemonic, polkadotJson } = item.owner
      let pair
      if (mnemonic) {
        pair = keyring.addFromMnemonic(mnemonic)
      } else {
        pair = keyring.addFromJson(polkadotJson)
      }

      return UPool.getBy(idKey, idValue).then(({ uuid }) => ({
        ...item.pool,
        owner: {
          polkadotJson: pair.toJson(),
          ss58Phala: pair.address,
          ss58Polkadot: keyring.encodeAddress(pair.publicKey, 0),
        },
        uuid,
      }))
    })
  )
  await UPool.updateItems(items)

  return returnAllWorkers()
}

const requestCreateWorker = async (message) => {
  const input = message.content.requestCreateWorker.workers
  await UWorker.createItems(input)
  return returnAllWorkers()
}
const requestUpdateWorker = async (message) => {
  const items = await Promise.all(
    message.content.requestUpdatePool.items.map((item) => {
      const idPb = prb.PoolOrWorkerQueryIdentity.fromObject(item.id)
      const idKey = idPb.identity
      const idValue = idPb[idKey]
      return UWorker.getBy(idKey, idValue).then(({ uuid }) => ({
        ...item.pool,
        uuid,
      }))
    })
  )
  await UWorker.updateItems(items)

  return returnAllWorkers()
}

export default {
  queryHandlers: {
    requestCreatePool,
    requestUpdatePool,
    requestCreateWorker,
    requestUpdateWorker,
  },
  plainHandlers: {},
}

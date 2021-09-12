import { UPool, UWorker } from '../../io/worker'
import { keyring } from '../../utils/api'
import { prb } from '../../message/proto.generated'
import { addWorker } from '../lifecycle'
import { returnAllWorkers } from './infra'

const applyOwner = (item) => {
  const { mnemonic, polkadotJson } = item.owner
  let pair
  if (mnemonic) {
    pair = keyring.addFromMnemonic(mnemonic)
  } else {
    pair = keyring.addFromJson(JSON.parse(polkadotJson))
  }
  item.owner = {
    polkadotJson: JSON.stringify(pair.toJson()),
    ss58Phala: pair.address,
    ss58Polkadot: keyring.encodeAddress(pair.publicKey, 0),
  }
}

const requestCreatePool = async (message) => {
  const input = message.content.requestCreatePool.pools
  for (const item of input) {
    applyOwner(item)
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

      applyOwner(item.pool)

      return UPool.getBy(idKey, idValue).then((_old) => {
        return {
          ...item.pool,
          uuid: _old.uuid,
          _old,
        }
      })
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
    message.content.requestUpdateWorker.items.map((item) => {
      const idPb = prb.PoolOrWorkerQueryIdentity.fromObject(item.id)
      const idKey = idPb.identity
      const idValue = idPb[idKey]
      return UWorker.getBy(idKey, idValue).then((_old) => ({
        ...item.worker,
        uuid: _old.uuid,
        _old,
      }))
    })
  )
  await UWorker.updateItems(items)

  return returnAllWorkers()
}

const requestRestartWorker = async (message) => {
  const promises = [];

  for (const item of message.content.requestRestartWorker.items) {
    const idPb = prb.PoolOrWorkerQueryIdentity.fromObject(item.id)
    const idKey = idPb.identity
    const idValue = idPb[idKey]

    const worker = await UWorker.getBy(idKey, idValue);
    const context = globalThis.LIFECYCLE_CONTEXT;

    promises.push(addWorker(worker, context));
  }

  await Promise.all(promises);

  return returnAllWorkers()
}

export default {
  queryHandlers: {
    requestCreatePool,
    requestUpdatePool,
    requestCreateWorker,
    requestUpdateWorker,
    requestRestartWorker,
  },
  plainHandlers: {},
}

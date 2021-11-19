import { DB_ENCODING_JSON } from './db_encoding'
import { DB_WORKER, getDb } from './db'
import { pbToObject } from './db_encoding'
import { v4 as uuid } from 'uuid'

export class NotFoundError extends Error {
  constructor(m) {
    super(m)
    this.name = 'NotFoundError'
  }
}
export class BadInputError extends Error {
  constructor(m) {
    super(m)
    this.name = 'BadInputError'
  }
}
export class DuplicatedItemError extends Error {
  constructor(m) {
    super(m)
    this.name = 'DuplicatedItemError'
  }
}

const getBy = async (conf, key, value) => {
  const db = await conf.dbPromise

  let storageKey
  if (key === 'uuid') {
    storageKey = `${conf.PREFIX_ID}${value}`
  } else {
    storageKey = JSON.parse(await db.get(`${conf.PREFIX_BY}${key}:${value}`))
  }
  const buffer = await db.getBuffer(storageKey)
  if (!buffer) {
    return buffer
  }
  return pbToObject(conf.pbType.decode(buffer))
}

const getAll = async (conf) => {
  const prefixLength = DB_WORKER.length + 1
  const db = await conf.dbPromise
  const keys = await db.keys(DB_WORKER + ':' + conf.PREFIX_ID + '*')

  const values = await keys
    .reduce(
      (prev, curr) => prev.getBuffer(curr.slice(prefixLength)),
      db.pipeline()
    )
    .exec()

  return values
    .map((v) => {
      const pb = conf.pbType.decode(v[1])
      return pbToObject(pb)
    })
    .filter((i) => !i.deleted)
}

const validateItem = async (conf, item, onUpdate) => {
  const db = await conf.dbPromise
  let nonexistence = conf.existenceKeys.reduce(
    (prev, key) => prev || (!item[key] ? key : prev),
    false
  )
  if (onUpdate && !item.uuid) {
    nonexistence = 'uuid'
  }
  if (nonexistence) {
    throw new BadInputError(
      `Missing key '${nonexistence}' in ${conf.name} item ${JSON.stringify(
        item
      )}`
    )
  }
  const duplication = (
    await Promise.all(
      conf.uniqueKeys.map(async (key) => {
        const storageKey = await db.get(
          `${conf.PREFIX_BY}${key}:${item[key]}`,
          {
            ...DB_ENCODING_JSON,
          }
        )

        if (!storageKey) {
          return false
        }

        if (!storageKey) {
          return false
        }
        if (onUpdate) {
          if (storageKey === `${conf.PREFIX_ID}${item.uuid}`) {
            return false
          }
        }
        return key
      })
    )
  ).reduce((prev, curr) => prev || curr, false)
  if (duplication) {
    throw new DuplicatedItemError(
      `Duplicated key '${duplication}' in ${conf.name} item ${JSON.stringify(
        item
      )}`
    )
  }
}

const setItems = async (conf, items) => {
  const db = await conf.dbPromise
  const batch = db.batch()
  for (const i of items) {
    const storageKey = `${conf.PREFIX_ID}${i.uuid}`
    if (i._old) {
      for (const k of conf.uniqueKeys) {
        batch.del(`${conf.PREFIX_BY}${k}:${i._old[k]}`)
      }
    }
    if (i.deleted === true) {
      // TODO: delayed deletion
    } else {
      for (const k of conf.uniqueKeys) {
        batch.set(`${conf.PREFIX_BY}${k}:${i[k]}`, JSON.stringify(storageKey))
      }
      batch.set(
        storageKey,
        conf.pbType.encode(conf.pbType.fromObject(i)).finish()
      )
    }
  }
  return batch.write()
}

export const createUpdatable = ({
  name,
  dbKey,
  existenceKeys: existenceKeys,
  uniqueKeys,
  pbType,
}) => {
  const dbPromise = getDb(dbKey)
  const _existenceKeys = Object.freeze([...existenceKeys])
  const _uniqueKeys = Object.freeze([...uniqueKeys])
  const _configuration = Object.freeze({
    name,
    dbPromise,
    existenceKeys: _existenceKeys,
    uniqueKeys: _uniqueKeys,
    pbType,
    PREFIX_ID: `${name}:id:`,
    PREFIX_BY: `${name}:by:`,
  })
  const createItems = async (items) => {
    for (const i of items) {
      i.uuid = uuid()
      i.deleted = false
      await validateItem(_configuration, i, false)
    }
    return setItems(_configuration, items)
  }
  const updateItems = async (items) => {
    for (const i of items) {
      await validateItem(_configuration, i, true)
    }
    return setItems(_configuration, items, true)
  }
  return {
    get: (uuid) => getBy(_configuration, 'uuid', uuid),
    getBy: (key, value) => getBy(_configuration, key, value),
    getAll: () => getAll(_configuration),
    commitDeletion: () => {}, // TODO
    createItems,
    updateItems,
    _configuration,
  }
}

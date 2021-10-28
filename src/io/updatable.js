import { DB_ENCODING_JSON } from './db_encoding'
import { getDb } from './db'
import { pbToObject } from './db_encoding'
import { v4 as uuid } from 'uuid'
import levelErrors from 'level-errors'

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
  try {
    const db = await conf.dbPromise

    let storageKey
    if (key === 'uuid') {
      storageKey = `${conf.PREFIX_ID}${value}`
    } else {
      storageKey = await db.get(`${conf.PREFIX_BY}${key}:${value}`, {
        ...DB_ENCODING_JSON,
      })
    }
    return pbToObject(conf.pbType.decode(await db.get(storageKey)))
  } catch (e) {
    if (e instanceof levelErrors.NotFoundError) {
      throw new NotFoundError(JSON.stringify({ type: conf.name, key, value }))
    }
    throw e
  }
}

const getAll = async (conf) =>
  conf.dbPromise
    .then(
      (db) =>
        new Promise((resolve, reject) => {
          const stream = db.createValueStream({
            gte: conf.PREFIX_ID,
            lte: conf.PREFIX_ID + '~',
          })
          const ret = []
          stream.on('data', async (value) => {
            ret.push(value)
          })
          stream.on('end', () => resolve(Promise.all(ret)))
          stream.on('error', reject)
        })
    )
    .then((pbs) =>
      pbs.map((buffer) => {
        const pb = conf.pbType.decode(buffer)
        return pbToObject(pb)
      })
    )
    .then((items) => items.filter((i) => !i.deleted))

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
        try {
          const storageKey = await db.get(
            `${conf.PREFIX_BY}${key}:${item[key]}`,
            {
              ...DB_ENCODING_JSON,
            }
          )

          if (!storageKey) {
            return false
          }
          if (onUpdate) {
            if (storageKey === `${conf.PREFIX_ID}${item.uuid}`) {
              return false
            }
          }
          return key
        } catch (e) {
          if (e instanceof levelErrors.NotFoundError) {
            return false
          }
          throw e
        }
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
        batch.put(`${conf.PREFIX_BY}${k}:${i[k]}`, storageKey, {
          ...DB_ENCODING_JSON,
        })
      }
      batch.put(
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

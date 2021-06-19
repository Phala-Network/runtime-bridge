import { DB_ENCODING_DEFAULT } from './db_encoding'
import { DB_WINDOW, getDb } from './db'
import levelErrors from 'level-errors'
import logger from '../utils/logger'

export const DB_WINDOW_WINDOW = Object.freeze({
  startBlock: [DB_ENCODING_DEFAULT],
  stopBlock: [DB_ENCODING_DEFAULT],
  currentBlock: [DB_ENCODING_DEFAULT],
  windowId: [DB_ENCODING_DEFAULT],
  setId: [DB_ENCODING_DEFAULT],
  isFinished: [DB_ENCODING_DEFAULT],
})
export const KEYS_DB_WINDOW_WINDOW = Object.freeze(
  Object.keys(DB_WINDOW_WINDOW)
)

export const getWindow = async (windowId) => {
  const db = getDb(DB_WINDOW)

  try {
    const retArr = await Promise.all(
      KEYS_DB_WINDOW_WINDOW.map((key) =>
        db.get(`window:${windowId}:${key}`, { ...DB_WINDOW_WINDOW[key][0] })
      )
    )
    const ret = {}
    KEYS_DB_WINDOW_WINDOW.forEach((key, index) => {
      ret[key] = retArr[index]
    })
    return ret
  } catch (error) {
    if (error instanceof levelErrors.NotFoundError) {
      return null
    }
    throw error
  }
}

const setWindowKv = async (windowId, key, value, _db = null) => {
  const db = _db || getDb(DB_WINDOW)
  return db.put(`window:${windowId}:${key}`, value, {
    ...DB_WINDOW_WINDOW[key][0],
  })
}

export const createWindow = async (windowId, data) => {
  const db = getDb(DB_WINDOW)
  await Promise.all(
    KEYS_DB_WINDOW_WINDOW.map((key) =>
      setWindowKv(windowId, key, data[key], db)
    )
  )
  return data
}

export const setEmptyWindow = (windowId, startBlock) => {
  return createWindow(windowId, {
    startBlock,
    stopBlock: -1,
    currentBlock: -1,
    windowId,
    setId: -1,
    isFinished: false,
  })
}
export const updateWindow = async (windowIdOrObject, data) => {
  const db = getDb(DB_WINDOW)

  const windowId =
    typeof windowIdOrObject === 'number'
      ? windowIdOrObject
      : windowIdOrObject.windowId
  const windowObject =
    typeof windowIdOrObject === 'number'
      ? await getWindow(windowId)
      : windowIdOrObject

  await Promise.all(
    Object.keys(data).map((key) => {
      if (KEYS_DB_WINDOW_WINDOW.indexOf(key) < 0) {
        logger.warn(`Key '${key}' is invalid to window.`)
        return
      }
      return setWindowKv(windowId, key, data[key], db)
    })
  )

  Object.assign(windowObject, data)
  return windowObject
}

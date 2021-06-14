import { DB_WINDOW, setupDb } from '../io/db'
import logger from '../utils/logger'

let startLock = false

export default async () => {
  if (startLock) {
    throw new Error('Unexpected re-initialization.')
  }
  await setupDb([DB_WINDOW])
}

import cluster from 'cluster'
import logger from '../utils/logger'

export type IpcMessageHandler = (...args: unknown[]) => void | Promise<void>
export type IpcMessageHandlerTable = {
  [K: string]: IpcMessageHandler
}

export const createIpcFork = <T extends IpcMessageHandlerTable>(
  handlerTable: T
) => {
  type MessageName = keyof T
  const send = <M extends MessageName>(
    method: M,
    ...params: Parameters<T[M]>
  ) => {
    process.send({ method, payload: JSON.stringify(params) })
  }
  const fork = (
    name: string,
    moduleName: string,
    env: { [K: string]: string } = {}
  ) => {
    if (!cluster.isPrimary) {
      throw new Error('Not a master process.')
    }
    const worker = cluster.fork({
      PHALA_MODULE: moduleName,
      ...env,
    })
    worker.on('online', () => {
      logger.info({ name, moduleName }, 'Subprocess online.')
    })
    worker.on('exit', (code, signal) => {
      if (signal) {
        logger.info({ name, moduleName, signal }, `Subprocess was killed.`)
      }
      if (code !== 0) {
        logger.info({ name, moduleName, code }, `Subprocess exited.`)
      }
      process.exit(code)
    })

    worker.on(
      'message',
      <M extends MessageName>(data: { method: M; payload: string }) => {
        handlerTable[data.method](
          ...(JSON.parse(data.payload) as Parameters<T[M]>)
        )
      }
    )

    const workerSend = <M extends MessageName>(
      method: M,
      ...params: Parameters<T[M]>
    ) => {
      worker.send({ method, payload: JSON.stringify(params) })
    }

    return {
      worker,
      send: workerSend,
    }
  }
  return { send, fork }
}

export const setupIpcWorker = <T extends IpcMessageHandlerTable>(
  handlerTable: T
) => {
  type MessageName = keyof T

  if (!cluster.isWorker) {
    throw new Error('Not a subprocess.')
  }

  process.on(
    'message',
    <M extends MessageName>(data: { method: M; payload: string }) => {
      handlerTable[data.method](
        ...(JSON.parse(data.payload) as Parameters<T[M]>)
      )
    }
  )

  const send = <M extends MessageName>(
    method: M,
    ...params: Parameters<T[M]>
  ) => {
    process.send({ method, payload: JSON.stringify(params) })
  }

  return { send }
}

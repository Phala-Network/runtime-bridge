import {
  APP_MESSAGE_TUNNEL_CHANNEL,
  APP_MESSAGE_TUNNEL_QUERY_TIMEOUT,
} from '../utils/constants'
import { Message, MessageTarget, MessageType } from './proto'
import { v4 as uuidv4 } from 'uuid'
import createRedisClient from '../utils/redis'
import logger from '../utils/logger'

const defaultEncode = (request) =>
  Message.encode(Message.fromObject(request)).finish()
const defaultDecode = (message) => Message.decode(message).toJSON()

const createMessageTunnel = async ({ redisEndpoint, from, encode, decode }) => {
  const pubClient = await createRedisClient(redisEndpoint)
  const subClient = await createRedisClient(redisEndpoint)

  const callbacks = new Map()

  const publish = async (request) => {
    const {
      to = MessageTarget.MTG_BROADCAST,
      nonce = '',
      nonceRef = '',
      type = MessageType.MTP_BROADCAST,
    } = request
    const _nonce = nonce || uuidv4()
    const createdAt = Date.now()

    const data = (encode || defaultEncode)({
      from,
      to,
      createdAt,
      nonce: _nonce,
      nonceRef,
      type,
      content: request,
    })

    await pubClient.publish(APP_MESSAGE_TUNNEL_CHANNEL, data)
    logger.debug(
      {
        from,
        to,
        createdAt,
        nonce: _nonce,
        nonceRef,
        type,
        content: request,
      },
      'published to rpc.'
    )
    return _nonce
  }

  const broadcast = (request) =>
    publish({
      ...request,
      type: MessageType.MTG_BROADCAST,
      to: MessageTarget.MTP_BROADCAST,
    })

  const query = (request) => {
    return new Promise((resolve, reject) =>
      (async () => {
        const nonce = uuidv4()
        callbacks.set(nonce, (...args) => {
          resolve(...args)
          callbacks.delete(nonce)
        })
        setTimeout(() => {
          callbacks.delete(nonce)
          reject(new Error('Timeout!'))
        }, APP_MESSAGE_TUNNEL_QUERY_TIMEOUT)
        await publish({
          ...request,
          nonce,
          type: MessageType.MTP_QUERY,
        })
        return nonce
      })()
    )
  }

  const reply = (request) =>
    publish({
      ...request,
      type: MessageType.MTP_REPLY,
    })

  const notify = (request) =>
    publish({
      ...request,
      type: MessageType.MTP_NOTIFY,
    })

  const subscribe = (dispatcher) => {
    return new Promise((resolve, reject) => {
      subClient.subscribe(APP_MESSAGE_TUNNEL_CHANNEL, (err, count) => {
        if (err) {
          return reject(err)
        }

        subClient.on('messageBuffer', (channel, message) => {
          if (channel.compare(APP_MESSAGE_TUNNEL_CHANNEL)) {
            logger.warn('Invalid message received.', { channel, message })
            return
          }
          let _message
          try {
            _message = (decode || defaultDecode)(message)
            logger.debug(_message, 'Receiving...')
          } catch (error) {
            logger.warn('Invalid message received.', error, { message })
          }
          if (!_message) {
            return
          }

          dispatcher.dispatch(_message)
        })
        resolve(count)
      })
    })
  }

  return {
    publish,
    broadcast,
    query,
    reply,
    notify,
    callbacks,
    subscribe,
    pubClient,
    subClient,
  }
}

const createDispatcher = ({
  tunnelConnection,
  queryHandlers,
  plainHandlers,
  dispatch,
}) => {
  const { callbacks } = tunnelConnection

  const plainCallback = (message) => {
    const cb = plainHandlers[Object.keys(message.content)[0]]
    if (typeof cb !== 'function') {
      logger.error('Handler not found!', message)
      return
    }
    cb(message, tunnelConnection)
  }

  const queryCallback = async (message) => {
    const cb = queryHandlers[Object.keys(message.content)[0]]
    if (typeof cb !== 'function') {
      logger.error('Handler not found!', {
        queryHandlers,
        message,
        key: Object.keys(message.content)[0],
      })
      return
    }
    const reply = await cb(message, tunnelConnection)
    await tunnelConnection.reply({
      ...reply,
      to: MessageTarget[message.from],
      nonceRef: message.nonce,
    })
  }

  const replyCallback = (message) => {
    try {
      const cb = callbacks.get(message.nonceRef)
      if (!cb) {
        logger.debug('Received invalid reply message.', { message })
        return
      }
      cb(message, tunnelConnection)
    } catch (error) {
      logger.warn('Error occured while processing a reply message.', error, {
        message,
      })
      // todo: handle error
    } finally {
      callbacks.delete(message.nonceRef)
    }
  }

  return {
    queryCallback,
    replyCallback,
    plainCallback,
    dispatch,
  }
}

export { createMessageTunnel, createDispatcher }

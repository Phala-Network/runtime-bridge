import createRedisClient from '@/utils/redis'
import { APP_MESSAGE_TUNNEL_CHANNEL, APP_MESSAGE_TUNNEL_QUERY_TIMEOUT } from '@/utils/constants'
import { Message } from './proto'

const defaultEncode = request => Message.encode(new Message(request)).finish()
const defaultDecode = message => Message.decode(message)

const createMessageTunnel = async ({ redisEndpoint, from, encode, decode }) => {
  const pubClient = await createRedisClient(redisEndpoint)
  const subClient = await createRedisClient(redisEndpoint)

  const callbacks = new Map()

  const publish = async (request) => {
    const { to = 0, nonce = 0, nonceRef = 0, type = 0 } = request
    const _nonce = nonce || Math.random * 1000000000
    const createdAt = Date.now()

    const data = (encode || defaultEncode)({
      ...request,
      from,
      to,
      createdAt,
      nonce: _nonce,
      nonceRef,
      type
    })

    await pubClient.publish(APP_MESSAGE_TUNNEL_CHANNEL, data)
    return _nonce
  }

  const broadcast = (request) => publish({
    ...request,
    type: 0,
    to: 0
  })

  const query = (request) => {
    return new Promise((resolve, reject) => (async () => {
      const nonce = Math.random * 1000000000
      callbacks.set(nonce, resolve)
      await publish({
        ...request,
        nonce,
        type: 1
      })
      setTimeout(() => reject(new TimeoutError()), APP_MESSAGE_TUNNEL_QUERY_TIMEOUT)
      return nonce
    })())
  }

  const reply = (request) => publish({
    ...request,
    type: 2
  })

  const notify = (request) => publish({
    ...request,
    type: 3
  })

  const subscribe = dispatcher => {
    return new Promise((resolve, reject) => {
      subClient.subscribe(APP_MESSAGE_TUNNEL_CHANNEL, (err, count) => {
        if (err) { return reject(err) }

        subClient.on('messageBuffer', (channel, message) => {
          if (channel.compare(APP_MESSAGE_TUNNEL_CHANNEL)) {
            $logger.warn('Invalid message received.', { channel, message })
            return
          }

          let _message
          try {
            _message = (decode || defaultDecode)(message)
          } catch (error) {
            $logger.warn('Invalid message received.', error, { message })
          }
          if (!_message) { return }

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
    subClient
  }
}

const createDispatcher = ({ tunnelConnection, queryHandlers, plainHandlers, dispatch }) => {
  const { callbacks } = tunnelConnection

  const plainCallback = (message) => {
    const cb = plainHandlers[message.type]
    if (typeof cb !== 'function') {
      throw new TypeError('Handler not found!')
    }
    cb(message)
  }

  const queryCallback = async (message) => {
    const cb = queryHandlers[message.type]
    if (typeof cb !== 'function') {
      throw new TypeError('Handler not found!')
    }
    const reply = await cb(message)
    await tunnelConnection.reply({
      ...reply,
      nonceRef: message.nonce
    })
  }

  const replyCallback = (message) => {
    try {
      const cb = callbacks.get(message.nonceRef)
      if (!cb) {
        $logger.warn('Received invalid reply message.', { message })
        return
      }
      cb(message)
    } catch (error) {
      $logger.warn('Error occured while processing a reply message.', error, { message })
      // todo: handle error
    }
  }

  return {
    queryCallback,
    replyCallback,
    plainCallback,
    dispatch
  }
}

export {
  createMessageTunnel,
  createDispatcher
}

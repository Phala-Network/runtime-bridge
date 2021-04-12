export const callOnlineLifecycleManager = async (message, context) => {
  const col = await context.ottoman.bucket.defaultCollection()
  const { content } = await col.get('lifecycleManagerStateUpdate')
  return {
    lifecycleManagerStateUpdate: content,
  }
}

export const fetcherStateUpdate = async (message, context) => {
  const col = await context.ottoman.bucket.defaultCollection()
  await col.upsert('fetcherState', message)

  return {
    ack: {
      ack: true,
    },
  }
}

import Arena from 'bull-arena'
import Bee from 'bee-queue'

import express from 'express'

export default async () => {
  const router = express.Router()

  const url = process.env.REDIS_ENDPOINT || 'redis://redis-q:6379/'

  const arena = Arena({
    Bee,
    queues: [
      {
        name: 'prbmq__main',
        hostId: 'prb',
        type: 'bee',
        url,
      },
    ],
  })

  router.use('/', arena)
}

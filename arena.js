import Arena from 'bull-arena'
import Bee from 'bee-queue'

import express from 'express'
const router = express.Router()

const url = process.env.REDIS_ENDPOINT || 'redis://redis:6379/'

console.log('Listening to ', url)

const arena = Arena({
  Bee,
  queues: [
    {
      name: 'prbmq',
      hostId: 'prb',
      type: 'bee',
      url,
    },
  ],
})

router.use('/', arena)

import Arena from 'bull-arena'
import Bee from 'bee-queue'

import express from 'express'
const router = express.Router()

const arena = Arena({
  Bee,
  queues: [
    {
      name: 'prbmq',
      hostId: 'prb',
      type: 'bee',
      url: 'redis://redis:6379/',
    },
  ],
})

router.use('/', arena)

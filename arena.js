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
      url: 'redis://127.0.0.1:6379/2'
    },
  ],
})

router.use('/', arena)

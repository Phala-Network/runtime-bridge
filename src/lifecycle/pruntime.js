import fetch from 'node-fetch'
import OrganizedBlob from '@/models/organized_blob'
import wait from '@/utils/wait'

class PRuntime {
  #runtimeEndpoint
  #runtimeInfo
  #redis
  #machine
  #phalaSs58Address
  #mq
  #initInfo
  #workerStates
  #phalaApi
  #ottoman
  #dispatcher

  constructor(options) {
    this.#runtimeEndpoint = options.machine.runtimeEndpoint
    this.#workerStates = options.workerStates
    this.#phalaApi = options.phalaApi
    this.#ottoman = options.ottoman
    this.#dispatcher = options.dispatcher
    this.#redis = options.redis
    this.#machine = options.machine
    this.#phalaSs58Address = options.machine.phalaSs58Address
  }

  async startLifecycle(skipRa = false, debugSetKey = null) {
    await this.initRuntime(skipRa, debugSetKey)
    const { blocknum, headernum } = this.#runtimeInfo

    let initBlobId = 1
    const _b = await OrganizedBlob.findOne({
      startBlock: headernum < blocknum ? headernum : blocknum,
    })
    initBlobId = _b ? _b.number : initBlobId

    await this.sendBlob(initBlobId)
  }

  async initRuntime(skipRa, debugSetKey) {
    $logger.info(`Trying to initialize pRuntime...`)
    await this.getInfo()

    let initRuntimeInfo

    if (this.#runtimeInfo.initialized) {
      $logger.info({ initRuntimeInfo }, `Already initialized, skipping.`)
      ;({ payload: initRuntimeInfo } = await this.doRequest(
        '/get_runtime_info'
      ))
    } else {
      const blob = await this.getBlob()
      const payload = Object.assign(JSON.parse(blob.genesisInfoBlob), {
        skip_ra: skipRa,
        debug_set_key: debugSetKey,
      })
      ;({ payload: initRuntimeInfo } = await this.doRequest(
        '/init_runtime',
        payload
      ))
      $logger.info({ initRuntimeInfo }, `Initialized pRuntime.`)
    }

    this.#initInfo = initRuntimeInfo

    await this.getInfo()
    setInterval(() => this.getInfo(), 6000)

    return this.#runtimeInfo
  }

  async getInfo() {
    const info = await this.doRequest('/get_info')
    this.#runtimeInfo = info.payload
    // todo: broadcast runtime info
    return info.payload
  }

  get runtimeInfo() {
    return this.#runtimeInfo
  }

  get initInfo() {
    return this.#initInfo
  }

  async sendBlob(id = 1) {
    const blob = await this.getBlob(id)
    const {
      startBlock,
      stopBlock,
      windowId,
      dispatchBlockBlob = {},
      syncHeaderBlob = {},
      number,
    } = blob
    $logger.info(
      { number, windowId },
      `Sending headers from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/sync_header', JSON.parse(syncHeaderBlob))
    $logger.info(
      { number, windowId },
      `Sending events from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/dispatch_block', JSON.parse(dispatchBlockBlob))
    $logger.info(`Blob #${blob.number} finished.`)
    return this.sendBlob(id + 1)
  }

  async getBlob(id = 0, shouldWait = true) {
    const ret = await OrganizedBlob.findOne({ number: id })
    if (!ret) {
      if (shouldWait) {
        $logger.info(`Waiting for blob #${id}...`)
        await wait(6000)
        return this.getBlob(id)
      }
      return null
    } else {
      $logger.info(`Loaded blob #${id}.`)
    }
    return ret
  }

  async doRequest(resource, payload = {}) {
    const url = `${this.#runtimeEndpoint}${resource}`
    const body = {
      input: payload,
      nonce: {
        value: Math.round(Math.random() * 1_000_000_000),
      },
    }
    $logger.debug({ url, body }, 'Sending HTTP request...')
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    const data = await res.json()

    if (data.status === 'ok') {
      $logger.debug({ url, data }, 'Receiving...')
      return {
        ...data,
        payload: JSON.parse(data.payload),
      }
    }

    $logger.warn({ url, data }, 'Receiving with error...')
    throw {
      ...data,
      payload: JSON.parse(data.payload),
    }
  }
}

export default PRuntime

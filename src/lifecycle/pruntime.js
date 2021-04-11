import fetch from 'node-fetch'
import OrganizedBlob from '@/models/organized_blob'
import wait from '@/utils/wait'

class PRuntime {
  #runtimeEndpoint
  #runtimeInfo
  #redis
  #machineRecordId
  #phalaSs58Address
  #mq
  #initInfo

  constructor(options) {
    this.#runtimeEndpoint = options.runtimeEndpoint
    this.#redis = options.redis
    this.#machineRecordId = options.machineRecordId
    this.#phalaSs58Address = options.phalaSs58Address
    this.#mq = options.mq
  }

  async startLifecycle(skipRa = false, debugSetKey = null) {
    await this.initRuntime(skipRa, debugSetKey)
    const { blocknum, headernum } = this.#runtimeInfo

    let initBlobId = 1
    initBlobId =
      (
        await OrganizedBlob.find({
          startBlock: headernum < blocknum ? headernum : blocknum,
        })
      )[0] || initBlobId
    initBlobId = parseInt(initBlobId)

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
      const payload = Object.assign(
        JSON.parse(blob.property('genesisInfoBlob')),
        {
          skip_ra: skipRa,
          debug_set_key: debugSetKey,
        }
      )
      ;({ payload: initRuntimeInfo } = await this.doRequest(
        '/init_runtime',
        payload
      ))
      $logger.info({ initRuntimeInfo }, `Initialized pRuntime.`)
    }

    this.#initInfo = initRuntimeInfo

    const machineId = this.#runtimeInfo.machine_id
    const machineOwner = await this.#mq.dispatch({
      action: 'GET_MACHINE_OWNER',
      payload: { machineId },
    })

    if (machineOwner.encoded === this.#phalaSs58Address) {
      $logger.info(
        { machineOwner: machineOwner.encoded },
        'Worker already registered, skipping.'
      )
    } else {
      let tx = await this.#mq.dispatch({
        action: 'REGISTER_WORKER',
        payload: {
          encodedRuntimeInfo: initRuntimeInfo.encoded_runtime_info,
          attestation: initRuntimeInfo.attestation,
          machineRecordId: this.#machineRecordId,
        },
      })
      try {
        tx = JSON.parse(tx)
      } catch (e) {
        $logger.warn(e)
      }
      $logger.info(
        { beforeMachineOwner: machineOwner.encoded, tx },
        `Worker registered.`
      )
    }

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
    } = blob.allProperties()
    $logger.info(
      { blobId: blob.id, windowId },
      `Sending headers from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/sync_header', JSON.parse(syncHeaderBlob))
    $logger.info(
      { blobId: blob.id, windowId },
      `Sending events from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/dispatch_block', JSON.parse(dispatchBlockBlob))
    $logger.info(`Blob #${blob.id} finished.`)
    return this.sendBlob(id + 1)
  }

  async getBlob(id = 0, shouldWait = true) {
    try {
      const ret = await OrganizedBlob.load(`${id}`)
      $logger.info(`Loaded blob #${id}.`)
      return ret
    } catch (e) {
      if (e?.message === 'not found') {
        $logger.info(`Waiting for blob #${id}...`)
        if (shouldWait) {
          await wait(6000)
          return this.getBlob(id)
        }
        return null
      }
      throw e
    }
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

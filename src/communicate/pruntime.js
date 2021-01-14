import fetch from 'node-fetch'
import OrganizedBlob from '@/models/organized_blob'
import wait from '@/utils/wait'
import { PHALA_ZERO_ACCOUNT } from '@/utils/constants'

class PRuntime {
  #runtimeEndpoint
  #runtimeInfo
  #redis
  #machineRecordId
  #phalaSs58Address
  #mq

  constructor (options) {
    this.#runtimeEndpoint = options.runtimeEndpoint
    this.#redis = options.redis
    this.#machineRecordId = options.machineRecordId
    this.#phalaSs58Address = options.phalaSs58Address
    this.#mq = options.mq
  }

  async initRuntime (skipRa = false, debugSetKey = null) {
    $logger.info(`Trying to initialize pRuntime...`)
    await this.getInfo()

    let initRuntimeInfo

    if (this.#runtimeInfo.initialized) {
      $logger.info({ initRuntimeInfo }, `Already initialized, skipping.`)
      const machineId = this.#runtimeInfo['machine_id']
      const machineOwner = await this.#mq.dispatch({
        action: 'GET_MACHINE_OWNER',
        payload: { machineId }
      })

      if (machineOwner.encoded !== this.#phalaSs58Address) {
        ({ payload: initRuntimeInfo } = await this.doRequest('/get_runtime_info', payload))
      }
    } else {
      const blob = await this.getBlob()
      const payload = Object.assign(JSON.parse(blob.property('genesisInfoBlob')), {
        skip_ra: skipRa,
        debug_set_key: debugSetKey
      })
      ;({ payload: initRuntimeInfo } = await this.doRequest('/init_runtime', payload))
      $logger.info({ initRuntimeInfo }, `Initialized pRuntime.`)
    }

    if (initRuntimeInfo) {
      const tx = await this.#mq.dispatch({
        action: 'REGISTER_WORKER',
        payload: {
          encodedRuntimeInfo: initRuntimeInfo.encoded_runtime_info,
          attestation: initRuntimeInfo.attestation,
          machineRecordId: this.#machineRecordId
        }
      })
      $logger.info({ tx }, `Worker registered.`)
    }

    await this.getInfo()
    setInterval(() => this.getInfo(), 6000)

    return this.#runtimeInfo
  }

  async getInfo () {
    const info = await this.doRequest('/get_info')
    this.#runtimeInfo = info.payload
    // todo: broadcast runtime info
    return info.payload
  }

  get runtimeInfo () {
    return this.#runtimeInfo
  }

  async sendBlob (id = 1) {
    const blob = await this.getBlob(id)
  }

  async getBlob (id = 0) {
    try {
      const ret = await OrganizedBlob.load(`${id}`)
      $logger.info(`Loaded blob #${id}.`)
      return ret
    } catch (e) {
      if (e?.message === 'not found') {
        $logger.info(`Waiting for blob #${id}...`)
        await wait(6000)
        return this.getBlob(id)
      }
      throw e
    }
  }

  async doRequest (resource, payload = {}) {
    const url = `${this.#runtimeEndpoint}${resource}`
    const body = {
      input: payload,
      nonce: {
        value: Math.round(Math.random() * 1_000_000_000)
      }
    }
    $logger.debug({ url, body }, 'Sending HTTP request...')
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    const data = await res.json()

    if (data.status === 'ok') {
      $logger.debug({ url, data }, 'Receiving...')
      return {
        ...data,
        payload: JSON.parse(data.payload)
      }
    }

    $logger.warn({ url, data }, 'Receiving with error...')
    throw {
      ...data,
      payload: JSON.parse(data.payload)
    }
  }
}

export default PRuntime

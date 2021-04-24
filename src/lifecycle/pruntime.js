import fetch from 'node-fetch'
import wait from '../utils/wait'
import createKeyring from '../utils/keyring'
import { getModel } from 'ottoman'
import { base64Decode } from '@polkadot/util-crypto'

const keyring = await createKeyring()

class PRuntime {
  #runtimeEndpoint
  #runtimeInfo
  #machine
  #machineId
  #phalaSs58Address
  #dispatchTx
  #initInfo
  #fetcherState
  #updateState
  #phalaApi
  #syncWorkerIngressTimeout

  constructor(options) {
    this.#runtimeEndpoint = options.machine.runtimeEndpoint
    this.#phalaApi = options.phalaApi
    this.#machine = options.machine
    this.#machineId = options.machine.id
    this.#phalaSs58Address = options.machine.phalaSs58Address
    this.#dispatchTx = options.dispatchTx
    this.#fetcherState = options.fetcherState
    this.#updateState = options.updateState
    this.#syncWorkerIngressTimeout = 0
  }

  async startSendBlob() {
    const OrganizedBlob = getModel('OrganizedBlob')
    const { blocknum, headernum } = this.#runtimeInfo
    let initBlobId = 1
    const _b = await OrganizedBlob.findOne({
      startBlock: headernum < blocknum ? headernum : blocknum,
    })
    initBlobId = _b ? _b.number : initBlobId

    await this.sendBlob(initBlobId)
  }

  _waitUntilSynched(resolve) {
    if (this.#runtimeInfo && this.#fetcherState) {
      const runtimeBlockNum = this.#runtimeInfo.blocknum
      const {
        fetcherStateUpdate: {
          synched: fetcherSynched,
          latestBlock: fetcherBlockNum,
        },
      } = this.#fetcherState
      if (fetcherSynched && fetcherBlockNum - runtimeBlockNum <= 1) {
        resolve()
        return
      }
    }
    setTimeout(() => this._waitUntilSynched(resolve), 3000)
  }

  waitUntilSynched() {
    return new Promise((resolve, reject) => {
      try {
        this._waitUntilSynched(resolve)
      } catch (error) {
        reject(error)
      }
    })
  }

  async initRuntime(skipRa = false, debugSetKey = null) {
    $logger.debug(`Trying to initialize pRuntime...`)
    await this.getInfo()

    let initRuntimeInfo

    if (this.#runtimeInfo.initialized) {
      $logger.debug({ initRuntimeInfo }, `Already initialized, skipping.`)
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

      $logger.debug({ initRuntimeInfo }, `Initialized pRuntime.`)
    }

    this.#initInfo = initRuntimeInfo
    const machineId = this.#runtimeInfo['machine_id']
    const machineOwner = keyring.encodeAddress(
      await this.#phalaApi.query.phala.machineOwner(machineId)
    )

    if (machineOwner === this.#phalaSs58Address) {
      $logger.debug(
        { machineOwner: machineOwner },
        'Worker already registered, skipping.'
      )
    } else {
      let tx = await this.#dispatchTx({
        action: 'REGISTER_WORKER',
        payload: {
          encodedRuntimeInfo: initRuntimeInfo['encoded_runtime_info'],
          attestation: initRuntimeInfo.attestation,
          machineRecordId: this.#machine.id,
        },
      })

      try {
        tx = JSON.parse(tx)
      } catch (e) {
        $logger.warn(e)
      }
      $logger.debug(
        { beforeMachineOwner: machineOwner.encoded, tx },
        `Worker registered.`
      )
    }

    await this.getInfo()
    setInterval(() => this.getInfo(), 6000)

    return this.#runtimeInfo
  }

  startSyncWorkerIngress() {
    const _sync = async (reject) => {
      await this.syncWorkerIngress()
      this.#syncWorkerIngressTimeout = setTimeout(
        () => _sync(reject).catch(reject),
        6000
      )
    }
    return new Promise((_, reject) => {
      _sync(reject).catch(reject)
    })
  }

  async syncWorkerIngress() {
    const onChainSequence = await this.#phalaApi.query.phala.workerIngress(
      this.#phalaSs58Address
    )

    const {
      GetWorkerEgress: { encoded_egress_b64: encodedEgressB64, length },
    } = await this.query(0, {
      GetWorkerEgress: {
        start_sequence: onChainSequence.toNumber(),
      },
    })

    if (!length) {
      $logger.debug(
        {
          onChainSequence,
          machineId: this.#machine.id,
        },
        'No worker ingress to sync.'
      )
      return
    }

    $logger.info(
      {
        length,
        onChainSequence,
        machineId: this.#machine.id,
      },
      'Synching worker ingress..'
    )

    const messageQueue = this.#phalaApi.createType(
      'Vec<SignedWorkerMessage>',
      base64Decode(encodedEgressB64)
    )

    await this.#dispatchTx({
      action: 'BATCH_SYNC_WORKER_MESSAGE',
      payload: {
        messages: messageQueue
          .map((message) => {
            if (message.data.sequence.lte(onChainSequence)) {
              return undefined
            }

            return message.toHex()
          })
          .filter((i) => i),
        machineRecordId: this.#machine.id,
      },
    })

    $logger.info(
      {
        length,
        beforeOnChainSequence: onChainSequence,
        machineId: this.#machine.id,
      },
      'Synched worker ingress.'
    )
    return messageQueue.length
  }

  async getInfo() {
    const info = await this.doRequest('/get_info')
    this.#runtimeInfo = info.payload
    const { headernum, blocknum } = info.payload
    await this.#updateState({
      latestSynchedBlock: blocknum,
      latestSynchedHeaderPhala: headernum,
    })
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
    $logger.debug(
      { number, windowId, machineId: this.#machineId },
      `Sending headers from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/sync_header', JSON.parse(syncHeaderBlob))
    $logger.debug(
      { number, windowId, machineId: this.#machineId },
      `Sending events from block #${startBlock} to #${stopBlock}...`
    )
    await this.doRequest('/dispatch_block', JSON.parse(dispatchBlockBlob))
    $logger.debug(
      { machineId: this.#machineId },
      `Blob #${blob.number} finished.`
    )
    return this.sendBlob(id + 1)
  }

  async getBlob(id = 0, shouldWait = true) {
    const OrganizedBlob = getModel('OrganizedBlob')
    let ret = null

    try {
      ret = await OrganizedBlob.findOne({ number: id })
    } catch (e) {
      if (e.message !== 'document not found') {
        $logger.error({ id }, 'getBlob', e)
      }
    }

    if (!ret) {
      if (shouldWait) {
        $logger.debug(`Waiting for blob #${id}...`)
        await wait(6000)
        return this.getBlob(id)
      }
      return null
    } else {
      $logger.debug(`Loaded blob #${id}.`)
    }
    return ret
  }

  async query(contractId, request) {
    const query = {
      contract_id: contractId,
      nonce: (Math.random() * 1000000) | 0,
      request,
    }
    const res = await this.doRequest('/query', {
      query_payload: JSON.stringify({
        Plain: JSON.stringify(query),
      }),
    })

    return JSON.parse(res.payload.Plain)
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

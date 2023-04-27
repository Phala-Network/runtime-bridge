import { LIFECYCLE, getMyId } from '../utils/my-id'
import { base64Decode } from '@polkadot/util-crypto'
import { decodePair } from '@polkadot/keyring/pair/decode'
import { setupLocalDb } from '../lifecycle/local_db'
import Pool from '../lifecycle/local_db/pool_model'
import Worker from '../lifecycle/local_db/worker_model'
import axios from 'axios'

const PRB3_API_ENDPOINT = process.env.OLD_DATA_PATH ?? 'http://127.0.0.1:3001'
const PRB3_API_CONFIG = '/wm/config'

const prb3Http = axios.create({
  baseURL: PRB3_API_ENDPOINT,
  timeout: 3000,
  headers: {
    'content-type': 'application/json',
  },
})

async function main() {
  const myId = await getMyId(LIFECYCLE)
  const localDb = await setupLocalDb(myId)
  const pools = await Pool.findAll()
  for (const p of pools) {
    const operator = p.operator
    const encoded = base64Decode(operator.toJson().encoded)
    const decoded = decodePair(undefined, encoded, 'none')
    const account = Buffer.from(decoded.secretKey).toString('hex')
    await prb3Http.post(PRB3_API_CONFIG, {
      AddPool: {
        name: p.name,
        pid: p.pid,
        disabled: !p.enabled,
        sync_only: p.syncOnly,
      },
    })
    await prb3Http.post(PRB3_API_CONFIG, {
      SetPoolOperator: {
        pid: p.pid,
        account,
        account_type: 'SecretKey',
        proxied_account_id: p.proxiedAccountSs58
          ? p.proxiedAccountSs58
          : undefined,
      },
    })
    console.log(`Migrated Pool #${p.pid}`)
  }
  const workers = await Worker.findAll({ include: [Pool] })
  for (const w of workers) {
    await prb3Http.post(PRB3_API_CONFIG, {
      AddWorker: {
        name: w.name,
        endpoint: w.endpoint,
        stake: w.stake,
        pid: w.pool.pid,
        disabled: !w.enabled,
        sync_only: w.syncOnly,
        gatekeeper: false,
      },
    })
    console.log(`Migrated Worker ${w.name}(#${w.endpoint})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(255)
})

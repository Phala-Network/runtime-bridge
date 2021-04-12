import packageJson from '../../package.json'
import { Command } from 'commander'
import { createLogger } from 'bunyan'

import applyFetch from './fetch'
import applyLifecycle from './lifecycle'
import applyTrade from './trade'
import applyCommon from './common'

globalThis.$logger = createLogger({
  level: 'info',
  name: 'prb',
})

const cli = new Command()

cli.version(packageJson.version)

applyCommon(cli)
applyFetch(cli)
applyLifecycle(cli)
applyTrade(cli)

cli.parse(process.argv)

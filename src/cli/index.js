import packageJson from '../../package.json'
import { Command } from 'commander'
import winston from 'winston'

import applyFetch from './fetch'
import applyCommunicate from './communicate'
import applyTrade from './trade'
import applyCommon from './common'

globalThis.$logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.prettyPrint()
  ),
  transports: [
    new winston.transports.Console()
  ]
})

const cli = new Command()

cli.version(packageJson.version)

applyCommon(cli)
applyFetch(cli)
applyCommunicate(cli)
applyTrade(cli)

cli.parse(process.argv)

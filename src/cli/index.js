import packageJson from '../../package.json'
import { program } from 'commander'

program.version(packageJson.version)
program.parse(process.argv)

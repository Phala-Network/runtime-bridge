#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await --no-warnings
import pnp from '../.pnp.cjs'
pnp.setup()

await import('./utils/link_root')
await import('./cli')

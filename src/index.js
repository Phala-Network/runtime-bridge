#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await
import pnp from '../.pnp.cjs'
pnp.setup()

await import('./utils/link_root')
await import('./cli')

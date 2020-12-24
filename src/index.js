#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await --no-warnings
await import('./utils/link_root')
await import('./cli')

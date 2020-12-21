// edited from https://github.com/janniks/basetag

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.resolve(dirname(__filename), '..', '..')

const modulesDir = 'node_modules'
const baseDir = path.join(__dirname, 'src')

function fileExists(path) {
  try {
    fs.accessSync(path)
    return true
  } catch (e) {
    return false
  }
}

try {
  const base = path.resolve(baseDir)
  const baseLink = path.resolve(__dirname, modulesDir, '@')
  if (!fileExists(baseLink)) {
    fs.symlinkSync(base, baseLink, 'junction')
  }
} catch (error) {
  throw error
}

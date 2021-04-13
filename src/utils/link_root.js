// edited from https://github.com/janniks/basetag

import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

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
  const baseModule = path.resolve(__dirname, modulesDir)
  const baseLink = path.resolve(__dirname, modulesDir, '@')
  if (!fileExists(baseModule)) {
    fs.mkdirSync(baseModule)
  }
  if (!fileExists(baseLink)) {
    fs.symlinkSync(base, baseLink, 'junction')
  }
} catch (error) {
  if (!(error && error.code === 'EEXIST')) {
    throw error
  }
}

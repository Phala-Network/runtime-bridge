#!/usr/bin/env -S node --experimental-json-modules --es-module-specifier-resolution=node --harmony-top-level-await
import phalaTypes from '../utils/typedefs'
import { ApiPromise, WsProvider } from '@polkadot/api'

const phalaProvider = new WsProvider('wss://poc4.phala.network/ws')
const api = await ApiPromise.create({
  provider: phalaProvider,
  types: phalaTypes,
})
const hash =
  '0x85c620607a6cabd43f068f806fe143fc1437126fe0013e28cf967be006f0cea8'
const val = await api.query.grandpa.currentSetId.at(hash)

console.log(val.toJSON())

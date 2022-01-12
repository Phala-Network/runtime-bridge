import type Redis, { RedisOptions } from 'ioredis'

export type PrbRedisClient = Redis.Redis & {
  put: Redis.Redis['set']
}

export type CreatePrbRedisClient = (
  endpoint: string,
  options: RedisOptions
) => Promise<PrbRedisConn>

declare const createClient: CreatePrbRedisClient

export default createClient

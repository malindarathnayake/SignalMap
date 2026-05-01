import type { RedisAdapter } from '../../src/server/lib/redis.types.ts';

const RENEW_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

/**
 * Try to acquire the lease. Returns true if the caller now owns it, false if held by another owner.
 * Implementation: SET NX PX (via adapter.setNx).
 */
export function acquireLease(
  redis: RedisAdapter,
  key: string,
  ttlSec: number,
  ownerId: string,
): Promise<boolean> {
  return redis.setNx(key, ownerId, ttlSec);
}

/**
 * Renew the lease ONLY if the caller still owns it. Returns true on successful renew, false if owner
 * mismatch (someone else now holds it, or it expired and was acquired by another).
 * Implementation: Lua EVAL atomic compare-and-PEXPIRE.
 */
export async function renewLease(
  redis: RedisAdapter,
  key: string,
  ttlSec: number,
  ownerId: string,
): Promise<boolean> {
  const result = await redis.eval(RENEW_LUA, [key], [ownerId, String(ttlSec * 1000)]);
  return Number(result) === 1;
}

/**
 * Release the lease ONLY if the caller still owns it. No-op (returns false) if owner mismatch.
 * Implementation: Lua EVAL atomic compare-and-DEL.
 */
export async function releaseLease(
  redis: RedisAdapter,
  key: string,
  ownerId: string,
): Promise<boolean> {
  const result = await redis.eval(RELEASE_LUA, [key], [ownerId]);
  return Number(result) === 1;
}

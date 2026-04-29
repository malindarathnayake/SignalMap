import type { RedisAdapter } from './redis.types.ts';

const RELEASE_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export interface SingleflightOptions {
  ttlSeconds: number;
  pollIntervalMs: number;
  maxWaitMs: number;
}

export interface AcquiredLock {
  acquired: true;
  release: () => Promise<void>;
}

export interface DidNotAcquire<T> {
  acquired: false;
  cached: T | null;
  reason: 'cache_hit' | 'stampede_timeout';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireOrPoll<T>(
  redis: RedisAdapter,
  lockKey: string,
  cacheKey: string,
  holderId: string,
  opts: SingleflightOptions,
): Promise<AcquiredLock | DidNotAcquire<T>> {
  const acquired = await redis.setNx(lockKey, holderId, opts.ttlSeconds);

  if (acquired) {
    return {
      acquired: true,
      release: async () => {
        await redis.eval(RELEASE_LUA, [lockKey], [holderId]);
      },
    };
  }

  const deadline = Date.now() + opts.maxWaitMs;

  while (Date.now() < deadline) {
    const cached = await redis.getJson<T>(cacheKey);
    if (cached !== null) {
      return { acquired: false, cached, reason: 'cache_hit' };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const sleepMs = Math.min(opts.pollIntervalMs, remaining);
    await wait(sleepMs);
  }

  const cached = await redis.getJson<T>(cacheKey);
  if (cached !== null) {
    return { acquired: false, cached, reason: 'cache_hit' };
  }

  return { acquired: false, cached: null, reason: 'stampede_timeout' };
}

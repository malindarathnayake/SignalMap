import type { RedisAdapter } from './redis.types.ts';

const RENEW_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export interface SingleflightOptions {
  ttlSeconds: number;
  pollIntervalMs: number;
  maxWaitMs: number;
  // When true, a renewal timer extends the lock TTL via CAS-Lua at TTL/2.
  // TTL must comfortably exceed worst-case event-loop stall + Redis RTT
  // (adapter command timeout is 5s); otherwise the lock can still expire
  // before CAS completes and another holder may acquire.
  renewal?: boolean;
}

/**
 * Handle returned to the winning caller.
 * - `signal` aborts when renewal can no longer prove ownership (CAS failed).
 *   Plumb it into long-running work (e.g. LLM HTTP calls) so spent budget
 *   doesn't keep accumulating after we've effectively lost the lock.
 * - `release()` is idempotent and safe to call multiple times. Concurrent
 *   callers share the same in-flight DEL promise.
 */
export interface AcquiredLock {
  acquired: true;
  signal: AbortSignal;
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
  // Validate timing inputs — misconfigured env yields NaN through Number()
  // and would otherwise tight-spin (pollIntervalMs<=0) or invalidate SET PX
  // (ttlSeconds<=0) or never time out (maxWaitMs=Infinity).
  if (!Number.isFinite(opts.ttlSeconds) || opts.ttlSeconds <= 0) {
    throw new Error(`singleflight: ttlSeconds must be finite and > 0 (got ${opts.ttlSeconds})`);
  }
  if (!Number.isFinite(opts.pollIntervalMs) || opts.pollIntervalMs <= 0) {
    throw new Error(`singleflight: pollIntervalMs must be finite and > 0 (got ${opts.pollIntervalMs})`);
  }
  if (!Number.isFinite(opts.maxWaitMs) || opts.maxWaitMs < 0) {
    throw new Error(`singleflight: maxWaitMs must be finite and >= 0 (got ${opts.maxWaitMs})`);
  }

  const acquired = await redis.setNx(lockKey, holderId, opts.ttlSeconds);

  if (acquired) {
    const abortController = new AbortController();
    let renewalInterval: NodeJS.Timeout | undefined;
    let closed = false;
    let releasePromise: Promise<void> | null = null;

    const stopRenewal = () => {
      if (renewalInterval) {
        clearInterval(renewalInterval);
        renewalInterval = undefined;
      }
    };

    const loseOwnership = () => {
      if (closed) return;
      closed = true;
      stopRenewal();
      abortController.abort();
    };

    if (opts.renewal) {
      const renewalIntervalMs = Math.floor((opts.ttlSeconds / 2) * 1000);
      renewalInterval = setInterval(() => {
        if (closed) {
          stopRenewal();
          return;
        }

        // Wrap in IIFE+catch so a thrown promise in setInterval can never
        // leak to the unhandledRejection handler (Node 22 default = throw).
        void (async () => {
          const result = await redis
            .eval(RENEW_LUA, [lockKey], [holderId, String(opts.ttlSeconds * 1000)])
            .catch(() => 0);

          if (closed) {
            return;
          }

          if (Number(result) !== 1) {
            // CAS reports we are no longer the holder. Stop renewing and
            // signal the caller so any in-flight LLM call can be aborted.
            loseOwnership();
          }
        })();
      }, renewalIntervalMs);
    }

    return {
      acquired: true,
      signal: abortController.signal,
      release: () => {
        if (releasePromise) {
          return releasePromise;
        }

        closed = true;
        stopRenewal();
        releasePromise = redis
          .eval(RELEASE_LUA, [lockKey], [holderId])
          .then(() => undefined);
        return releasePromise;
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

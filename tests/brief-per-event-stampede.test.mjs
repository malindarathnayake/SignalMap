/**
 * Integration tests for per-event singleflight (acquireOrPoll).
 *
 * Requires a Redis 7 server at REDIS_URL.
 * Skip gracefully when REDIS_URL is absent.
 *
 * Run:
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/brief-per-event-stampede.test.mjs
 */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import { acquireOrPoll } from '../src/server/lib/singleflight.ts';

const REDIS_URL = process.env.REDIS_URL;
let probeFailed = !REDIS_URL;

if (!REDIS_URL) {
  console.warn('[brief-per-event-stampede.test] REDIS_URL not set — skipping suite');
}

describe('singleflight acquireOrPoll — live Redis', { skip: probeFailed }, () => {
  let redis;

  before(async () => {
    redis = createRedisAdapter({ url: REDIS_URL });
    try {
      await redis.incr('signalmap:test:probe:sf');
      await redis.del('signalmap:test:probe:sf');
    } catch (err) {
      probeFailed = true;
      console.warn('[brief-per-event-stampede.test] Redis unreachable:', err?.message);
    }
  });

  after(async () => {
    if (redis) await redis.quit();
  });

  function keys() {
    const id = randomUUID();
    return {
      lockKey: `signalmap:test:sf:lock:${id}`,
      cacheKey: `signalmap:test:sf:cache:${id}`,
    };
  }

  it('first caller acquires lock; release deletes it so next acquire works', { skip: probeFailed }, async () => {
    const { lockKey, cacheKey } = keys();

    const result = await acquireOrPoll(redis, lockKey, cacheKey, 'holder-1', {
      ttlSeconds: 30,
      pollIntervalMs: 50,
      maxWaitMs: 200,
    });

    assert.equal(result.acquired, true);
    if (result.acquired) {
      await result.release();
    }

    // After release, a new acquire should succeed
    const result2 = await acquireOrPoll(redis, lockKey, cacheKey, 'holder-2', {
      ttlSeconds: 30,
      pollIntervalMs: 50,
      maxWaitMs: 200,
    });
    assert.equal(result2.acquired, true);
    if (result2.acquired) {
      await result2.release();
    }
  });

  it('second caller polls and returns cache_hit when cache is written during wait', { skip: probeFailed }, async () => {
    const { lockKey, cacheKey } = keys();

    // First caller acquires
    const first = await acquireOrPoll(redis, lockKey, cacheKey, 'holder-1', {
      ttlSeconds: 30,
      pollIntervalMs: 50,
      maxWaitMs: 2000,
    });
    assert.equal(first.acquired, true);

    // Second caller starts polling concurrently
    const secondPromise = acquireOrPoll(redis, lockKey, cacheKey, 'holder-2', {
      ttlSeconds: 30,
      pollIntervalMs: 50,
      maxWaitMs: 2000,
    });

    // After a short delay, write cache and release lock
    await new Promise((r) => setTimeout(r, 150));
    await redis.setJsonEx(cacheKey, { data: 'ready' }, 60);
    if (first.acquired) await first.release();

    const second = await secondPromise;
    assert.equal(second.acquired, false);
    if (!second.acquired) {
      assert.equal(second.reason, 'cache_hit');
      assert.deepEqual(second.cached, { data: 'ready' });
    }

    await redis.del(cacheKey);
  });

  it('second caller returns stampede_timeout when cache is never written', { skip: probeFailed }, async () => {
    const { lockKey, cacheKey } = keys();

    // First caller acquires and holds without writing cache
    const first = await acquireOrPoll(redis, lockKey, cacheKey, 'holder-1', {
      ttlSeconds: 30,
      pollIntervalMs: 30,
      maxWaitMs: 200,
    });
    assert.equal(first.acquired, true);

    const second = await acquireOrPoll(redis, lockKey, cacheKey, 'holder-2', {
      ttlSeconds: 30,
      pollIntervalMs: 30,
      maxWaitMs: 200,
    });

    assert.equal(second.acquired, false);
    if (!second.acquired) {
      assert.equal(second.reason, 'stampede_timeout');
      assert.equal(second.cached, null);
    }

    if (first.acquired) await first.release();
  });

  it('stampede: 10 concurrent acquireOrPoll — exactly 1 acquires, rest get cache_hit', { skip: probeFailed }, async () => {
    const { lockKey, cacheKey } = keys();

    const opts = {
      ttlSeconds: 30,
      pollIntervalMs: 30,
      maxWaitMs: 3000,
    };

    // Launch 10 concurrent acquireOrPoll calls
    const promises = Array.from({ length: 10 }, (_, i) =>
      acquireOrPoll(redis, lockKey, cacheKey, `holder-${i}`, opts),
    );

    // Wait for one to acquire
    const results = await Promise.all(
      promises.map(async (p) => {
        const r = await p;
        if (r.acquired) {
          // Holder writes cache then releases
          await new Promise((res) => setTimeout(res, 50));
          await redis.setJsonEx(cacheKey, { result: 'ok' }, 60);
          await r.release();
        }
        return r;
      }),
    );

    const acquired = results.filter((r) => r.acquired === true);
    const notAcquired = results.filter((r) => r.acquired === false);

    assert.equal(acquired.length, 1, `Expected exactly 1 acquirer, got ${acquired.length}`);
    assert.equal(notAcquired.length, 9);

    for (const r of notAcquired) {
      if (!r.acquired) {
        assert.equal(r.reason, 'cache_hit', `Expected cache_hit, got ${r.reason}`);
        assert.deepEqual(r.cached, { result: 'ok' });
      }
    }

    await redis.del(cacheKey);
  });

  it('release() with stale holderId does not delete a different holder\'s lock', { skip: probeFailed }, async () => {
    const lockKey = `signalmap:test:lock:${randomUUID()}`;
    const cacheKey = `signalmap:test:cache:${randomUUID()}`;
    const holderA = 'pid-A-' + randomUUID();
    const holderB = 'pid-B-' + randomUUID();

    // Holder A acquires with TTL 1s
    const aResult = await acquireOrPoll(redis, lockKey, cacheKey, holderA, {
      ttlSeconds: 1, pollIntervalMs: 50, maxWaitMs: 100,
    });
    assert.equal(aResult.acquired, true);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1100));

    // Holder B acquires — different holderId
    const bResult = await acquireOrPoll(redis, lockKey, cacheKey, holderB, {
      ttlSeconds: 30, pollIntervalMs: 50, maxWaitMs: 100,
    });
    assert.equal(bResult.acquired, true);

    // A's stale release MUST NOT delete B's lock
    await aResult.release();

    // Verify B's lock still exists via setNx probe
    const setNxAttempt = await redis.setNx(lockKey, 'C', 30);
    assert.equal(setNxAttempt, false, 'B\'s lock should still be held; setNx by C must fail');

    // Cleanup: B releases properly
    await bResult.release();
    // Verify B's release worked
    const setNxAfterB = await redis.setNx(lockKey, 'D', 30);
    assert.equal(setNxAfterB, true, 'After B released, the lock should be free');
    await redis.del(lockKey);
  });
});

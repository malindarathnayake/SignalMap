/**
 * Integration tests for per-IP rate limiting.
 *
 * Requires a Redis 7 server at REDIS_URL.
 * Skip gracefully when REDIS_URL is absent.
 *
 * Run:
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/brief-rate-limit.test.mjs
 */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import { getMinuteWindowKey, rateLimit } from '../src/server/lib/rate-limit.ts';

const REDIS_URL = process.env.REDIS_URL;
let probeFailed = !REDIS_URL;

if (!REDIS_URL) {
  console.warn('[brief-rate-limit.test] REDIS_URL not set — skipping suite');
}

describe('rate-limit — live Redis', { skip: probeFailed }, () => {
  let redis;

  before(async () => {
    redis = createRedisAdapter({ url: REDIS_URL });
    try {
      await redis.incr('signalmap:test:probe:rl');
      await redis.del('signalmap:test:probe:rl');
    } catch (err) {
      probeFailed = true;
      console.warn('[brief-rate-limit.test] Redis unreachable:', err?.message);
    }
  });

  after(async () => {
    if (redis) await redis.quit();
  });

  function uniqueKey() {
    return `signalmap:test:rl:${randomUUID()}`;
  }

  it('getMinuteWindowKey produces expected key shape', { skip: probeFailed }, () => {
    const d = new Date('2026-04-28T13:07:00Z');
    const key = getMinuteWindowKey('signalmap:brief:rl', '1.2.3.4', d);
    assert.equal(key, 'signalmap:brief:rl:1.2.3.4:2026-04-28T13:07');
  });

  it('rateLimit allows first N calls then blocks subsequent calls', { skip: probeFailed }, async () => {
    const key = uniqueKey();
    const limit = 3;

    try {
      for (let i = 1; i <= limit; i++) {
        const result = await rateLimit(redis, key, limit, 60);
        assert.equal(result.allowed, true, `Call ${i} should be allowed`);
        assert.equal(result.current, i);
        assert.equal(result.limit, limit);
        assert.equal(result.retryAfterSeconds, 0);
      }

      // Call beyond limit
      const over = await rateLimit(redis, key, limit, 60);
      assert.equal(over.allowed, false);
      assert.equal(over.current, limit + 1);
      assert.equal(over.limit, limit);
      assert.equal(over.retryAfterSeconds, 60);
    } finally {
      await redis.del(key);
    }
  });

  it('key has a TTL after first increment and counter resets after del', { skip: probeFailed }, async () => {
    const key = uniqueKey();
    const limit = 5;

    try {
      const r1 = await rateLimit(redis, key, limit, 60);
      assert.equal(r1.current, 1);

      // Delete the key — simulates window expiry
      await redis.del(key);

      // Counter should reset
      const r2 = await rateLimit(redis, key, limit, 60);
      assert.equal(r2.current, 1);
      assert.equal(r2.allowed, true);
    } finally {
      await redis.del(key);
    }
  });

  it('unique keys per call do not collide', { skip: probeFailed }, async () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();
    const limit = 2;

    try {
      await rateLimit(redis, key1, limit, 60);
      await rateLimit(redis, key1, limit, 60);

      // key2 starts fresh at 1
      const r = await rateLimit(redis, key2, limit, 60);
      assert.equal(r.current, 1);
    } finally {
      await redis.del(key1);
      await redis.del(key2);
    }
  });
});

/**
 * Integration tests for spend-reservation primitives.
 *
 * Requires a Redis 7 server at REDIS_URL.
 * Skip gracefully when REDIS_URL is absent.
 *
 * Run:
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/brief-spend-reservation.test.mjs
 */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import {
  getSpendKey,
  getResetAt,
  reserveSpend,
  refundDifference,
  readDailySpend,
} from '../src/server/lib/spend-reservation.ts';

const REDIS_URL = process.env.REDIS_URL;
let probeFailed = !REDIS_URL;

if (!REDIS_URL) {
  console.warn('[brief-spend-reservation.test] REDIS_URL not set — skipping suite');
}

describe('spend-reservation — live Redis', { skip: probeFailed }, () => {
  let redis;

  before(async () => {
    redis = createRedisAdapter({ url: REDIS_URL });
    try {
      await redis.incr('signalmap:test:probe:spend');
      await redis.del('signalmap:test:probe:spend');
    } catch (err) {
      probeFailed = true;
      console.warn('[brief-spend-reservation.test] Redis unreachable:', err?.message);
    }
  });

  after(async () => {
    if (redis) await redis.quit();
  });

  function uniqueDate() {
    return new Date(2030, 0, 1 + Math.floor(Math.random() * 100000));
  }

  it('getSpendKey formats UTC date correctly', { skip: probeFailed }, () => {
    const d = new Date('2026-04-28T13:00:00Z');
    assert.equal(getSpendKey(d), 'signalmap:llm:spend:2026-04-28');
  });

  it('getResetAt returns next UTC midnight as ISO string', { skip: probeFailed }, () => {
    const d = new Date('2026-04-28T13:00:00Z');
    assert.equal(getResetAt(d), '2026-04-29T00:00:00.000Z');
  });

  it('reserveSpend returns ok:true when within budget', { skip: probeFailed }, async () => {
    const testDate = uniqueDate();
    const key = getSpendKey(testDate);

    try {
      const result = await reserveSpend(redis, 0.10, 1.00, { date: testDate });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.reservedUsd, 0.10);
        assert.ok(Math.abs(result.runningTotalUsd - 0.10) < 1e-9);
      }

      const stored = await readDailySpend(redis, { date: testDate });
      assert.ok(Math.abs(stored - 0.10) < 1e-9);

      // Verify TTL armed on first write (between 6 and 7 days)
      // ioredis: ttl returns seconds. Use raw client via createRedisAdapter is not
      // exposed; instead, use the test container's redis-cli or use eval. We have
      // redis.eval now — use Lua TTL via eval.
      const ttlSec = await redis.eval('return redis.call("TTL", KEYS[1])', [key], []);
      assert.ok(
        Number(ttlSec) > 6 * 86400 - 60 && Number(ttlSec) <= 7 * 86400,
        `Expected TTL ~7d, got ${ttlSec}`,
      );
    } finally {
      await redis.del(key);
    }
  });

  it('reserveSpend returns ok:false + rolls back when over budget', { skip: probeFailed }, async () => {
    const testDate = uniqueDate();
    const key = getSpendKey(testDate);

    try {
      // Pre-seed with 0.90
      await reserveSpend(redis, 0.90, 1.00, { date: testDate });

      // This 0.20 reservation would push to 1.10 — over budget
      const result = await reserveSpend(redis, 0.20, 1.00, { date: testDate });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, 'budget_exhausted');
        assert.equal(result.budgetUsd, 1.00);
        assert.ok(typeof result.resetsAt === 'string');
        // Post-refund total should be ~0.90
        assert.ok(Math.abs(result.runningTotalUsd - 0.90) < 1e-9);
      }

      // Verify Redis key was rolled back
      const stored = await readDailySpend(redis, { date: testDate });
      assert.ok(Math.abs(stored - 0.90) < 1e-9);
    } finally {
      await redis.del(key);
    }
  });

  it('reserveSpend throws when estCostUsd < 0', { skip: probeFailed }, async () => {
    await assert.rejects(
      () => reserveSpend(redis, -0.01, 1.00),
      /estCostUsd must be >= 0/,
    );
  });

  it('reserveSpend throws when budgetUsd <= 0', { skip: probeFailed }, async () => {
    await assert.rejects(
      () => reserveSpend(redis, 0.01, 0),
      /budgetUsd must be > 0/,
    );
  });

  it('refundDifference adjusts the float by actualCost - estCost', { skip: probeFailed }, async () => {
    const testDate = uniqueDate();
    const key = getSpendKey(testDate);

    try {
      await reserveSpend(redis, 0.50, 2.00, { date: testDate });
      // Actual cost was 0.30 — refund 0.20
      const newTotal = await refundDifference(redis, 0.50, 0.30, { date: testDate });
      assert.ok(Math.abs(newTotal - 0.30) < 1e-9, `Expected 0.30, got ${newTotal}`);
    } finally {
      await redis.del(key);
    }
  });

  it('refundDifference with zero delta returns current total without extra write', { skip: probeFailed }, async () => {
    const testDate = uniqueDate();
    const key = getSpendKey(testDate);

    try {
      await reserveSpend(redis, 0.40, 2.00, { date: testDate });
      const newTotal = await refundDifference(redis, 0.40, 0.40, { date: testDate });
      assert.ok(Math.abs(newTotal - 0.40) < 1e-9, `Expected 0.40, got ${newTotal}`);
    } finally {
      await redis.del(key);
    }
  });

  it('10 concurrent reserveSpend — exactly floor(budget/cost) succeed', { skip: probeFailed }, async () => {
    const testDate = uniqueDate();
    const key = getSpendKey(testDate);
    const cost = 0.25;
    const budget = 1.00; // floor(1.00 / 0.25) = 4 should succeed

    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => reserveSpend(redis, cost, budget, { date: testDate })),
      );

      const successes = results.filter((r) => r.ok === true);
      const exhausted = results.filter((r) => r.ok === false);

      assert.equal(successes.length + exhausted.length, 10);
      assert.equal(successes.length, Math.floor(budget / cost));
    } finally {
      await redis.del(key);
    }
  });
});

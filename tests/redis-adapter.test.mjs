/**
 * Live integration tests for the ioredis-backed RedisAdapter.
 *
 * Requires a Redis 7 server accessible at REDIS_URL (default: redis://localhost:6380).
 * The suite is skipped gracefully when Redis is not available, so `npm run test:data`
 * does not fail in environments where Redis is not running.
 *
 * To run locally:
 *   docker rm -f signalmap-test-redis 2>/dev/null
 *   docker run -d --name signalmap-test-redis -p 6380:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/redis-adapter.test.mjs
 */

import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisAdapter } from '../src/server/lib/redis.ts';

const REDIS_URL = process.env.REDIS_URL;
let adapter;
let probeFailed = false;

if (!REDIS_URL) {
  probeFailed = true;
  console.warn('[redis-adapter.test] REDIS_URL not set — skipping suite');
}

describe('RedisAdapter (ioredis impl) — live container', { skip: probeFailed }, () => {
  before(async () => {
    adapter = createRedisAdapter({ url: REDIS_URL });
    try {
      // Cheap probe: incr + del (no special method needed)
      await adapter.incr('signalmap:test:probe');
      await adapter.del('signalmap:test:probe');
    } catch (err) {
      probeFailed = true;
      console.warn('[redis-adapter.test] Redis unreachable, skipping:', err?.message);
    }
  });

  after(async () => {
    if (adapter) await adapter.quit();
  });

  beforeEach(async () => {
    if (probeFailed) return;
    // Best-effort cleanup of test keyspace before each test
    for (const k of [
      'signalmap:test:json',
      'signalmap:test:jsonex',
      'signalmap:test:lock',
      'signalmap:test:counter',
      'signalmap:test:float',
      'signalmap:test:exp',
      'signalmap:test:del',
      'signalmap:test:pipe-a',
      'signalmap:test:pipe-b',
    ]) {
      await adapter.del(k);
    }
  });

  // 1. getJson returns null on missing key
  it('getJson returns null when key missing', { skip: probeFailed }, async () => {
    const result = await adapter.getJson('signalmap:test:json');
    assert.equal(result, null);
  });

  // 2. setJson + getJson round-trips a structured object
  it('setJson then getJson round-trips a structured object', { skip: probeFailed }, async () => {
    const obj = { hello: 'world', count: 42, nested: { flag: true } };
    await adapter.setJson('signalmap:test:json', obj);
    const result = await adapter.getJson('signalmap:test:json');
    assert.deepEqual(result, obj);
  });

  // 3. setJsonEx writes value with TTL (verify by reading back the value)
  it('setJsonEx writes value with TTL and value is readable', { skip: probeFailed }, async () => {
    const obj = { ttl: 'test' };
    await adapter.setJsonEx('signalmap:test:jsonex', obj, 60);
    const result = await adapter.getJson('signalmap:test:jsonex');
    assert.deepEqual(result, obj);
  });

  // 4. setNx returns true on first call, false on second
  it('setNx returns true on first call, false on second', { skip: probeFailed }, async () => {
    const first = await adapter.setNx('signalmap:test:lock', 'holder-1', 30);
    assert.equal(first, true);
    const second = await adapter.setNx('signalmap:test:lock', 'holder-2', 30);
    assert.equal(second, false);
  });

  // 5. incr returns 1 on first call, 2 on second
  it('incr returns 1 on first call and 2 on second', { skip: probeFailed }, async () => {
    const v1 = await adapter.incr('signalmap:test:counter');
    assert.equal(v1, 1);
    const v2 = await adapter.incr('signalmap:test:counter');
    assert.equal(v2, 2);
  });

  // 6. incrByFloat adds positive delta; second call with negative delta refunds
  it('incrByFloat adds and refunds (reserve/refund pattern)', { skip: probeFailed }, async () => {
    const afterReserve = await adapter.incrByFloat('signalmap:test:float', 1.5);
    assert.ok(Math.abs(afterReserve - 1.5) < 1e-9, `Expected 1.5, got ${afterReserve}`);
    // Refund (negative delta)
    const afterRefund = await adapter.incrByFloat('signalmap:test:float', -0.3);
    assert.ok(Math.abs(afterRefund - 1.2) < 1e-9, `Expected 1.2, got ${afterRefund}`);
  });

  // 7. expire arms TTL on a key written by incr; verify by reading back the value
  it('expire arms TTL on a key and value is still readable', { skip: probeFailed }, async () => {
    await adapter.incr('signalmap:test:exp');
    await adapter.expire('signalmap:test:exp', 60);
    // Key should still exist and be readable immediately after expiry is set
    const result = await adapter.incr('signalmap:test:exp'); // should now be 2
    assert.equal(result, 2);
  });

  // 8. del removes a key (setJson, del, getJson === null)
  it('del removes a key so getJson returns null', { skip: probeFailed }, async () => {
    await adapter.setJson('signalmap:test:del', { data: 'to-delete' });
    // Confirm it exists
    const before = await adapter.getJson('signalmap:test:del');
    assert.notEqual(before, null);
    // Delete and verify it's gone
    await adapter.del('signalmap:test:del');
    const after = await adapter.getJson('signalmap:test:del');
    assert.equal(after, null);
  });

  // 9. pipeline runs SET then GET and returns results in order
  it('pipeline runs SET then GET and returns results in order', { skip: probeFailed }, async () => {
    const results = await adapter.pipeline([
      ['SET', 'signalmap:test:pipe-a', 'x'],
      ['GET', 'signalmap:test:pipe-a'],
    ]);
    assert.equal(results[1], 'x');
  });

  // 10. publish + subscribe deliver a message
  it('subscribe delivers a published message', { skip: probeFailed }, async () => {
    const channel = 'signalmap:test:pubsub';
    const received = [];

    const disposer = adapter.subscribe(channel, (msg) => {
      received.push(msg);
    });

    // Give the subscriber connection a moment to register
    await new Promise((r) => setTimeout(r, 100));

    await adapter.publish(channel, 'hello-world');
    await new Promise((r) => setTimeout(r, 250));

    disposer.dispose();

    assert.ok(received.length >= 1, `Expected at least 1 message, got ${received.length}`);
    assert.equal(received[0], 'hello-world');
  });

  // 11. subscribe disposer prevents further deliveries
  it('subscribe disposer prevents further deliveries', { skip: probeFailed }, async () => {
    const channel = 'signalmap:test:pubsub-dispose';
    const received = [];

    const disposer = adapter.subscribe(channel, (msg) => {
      received.push(msg);
    });

    // Give the subscriber connection a moment to register
    await new Promise((r) => setTimeout(r, 100));

    // Dispose before publishing
    disposer.dispose();

    // Small delay so unsubscribe can propagate
    await new Promise((r) => setTimeout(r, 100));

    await adapter.publish(channel, 'should-not-arrive');
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(received.length, 0, `Expected 0 messages after dispose, got ${received.length}`);
  });
});

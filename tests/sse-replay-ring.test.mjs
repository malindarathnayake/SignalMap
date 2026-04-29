/**
 * Smoke tests for the SSE replay ring (Redis sorted-set backed).
 *
 * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
 * Skips cleanly when Redis is unavailable.
 *
 * To run locally:
 *   docker run -d --rm --name sigmap-test-redis -p 6380:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/sse-replay-ring.test.mjs
 */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisAdapter } from '../src/server/lib/redis.ts';
import {
  nextEventId,
  addEventToRing,
  replayFrom,
  ringStats,
} from '../src/server/lib/sse-replay-ring.ts';

const REDIS_URL = process.env.REDIS_URL;
let adapter;
let probeFailed = false;

if (!REDIS_URL) {
  probeFailed = true;
  console.warn('[sse-replay-ring.test] REDIS_URL not set — skipping suite');
}

// Test key constants (must match sse-replay-ring.ts internals)
const COUNTER_KEY = 'signalmap:sse:counter';
const RING_KEY = 'signalmap:sse:ring';
const EVENT_KEY_PREFIX = 'signalmap:sse:event:';

async function cleanupRing(adapter, ids) {
  await adapter.del(COUNTER_KEY);
  await adapter.del(RING_KEY);
  for (const id of ids) {
    await adapter.del(`${EVENT_KEY_PREFIX}${id}`);
  }
}

/**
 * Restores an env var to its previous value.
 * When prev was undefined (var was not set), deletes the key rather than
 * assigning the string "undefined" which would corrupt Number() parsing.
 */
function restoreEnv(key, prev) {
  if (prev === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = prev;
  }
}

describe('SSE replay ring — live Redis smoke tests', { skip: probeFailed }, () => {
  before(async () => {
    adapter = createRedisAdapter({ url: REDIS_URL });
    try {
      await adapter.incr('signalmap:test:probe');
      await adapter.del('signalmap:test:probe');
    } catch (err) {
      probeFailed = true;
      console.warn('[sse-replay-ring.test] Redis unreachable, skipping:', err?.message);
    }
    // Pre-clean ring state
    await cleanupRing(adapter, []);
  });

  after(async () => {
    if (adapter) await adapter.quit();
  });

  // 1. nextEventId produces strictly increasing values
  it('nextEventId produces strictly increasing values', { skip: probeFailed }, async () => {
    // Reset counter
    await adapter.del(COUNTER_KEY);

    const id1 = await nextEventId(adapter);
    const id2 = await nextEventId(adapter);
    const id3 = await nextEventId(adapter);

    assert.ok(id1 < id2, `id1 (${id1}) should be < id2 (${id2})`);
    assert.ok(id2 < id3, `id2 (${id2}) should be < id3 (${id3})`);
    assert.equal(id2, id1 + 1);
    assert.equal(id3, id2 + 1);

    await cleanupRing(adapter, []);
  });

  // 2. addEventToRing + replayFrom round-trip an event correctly
  it('addEventToRing + replayFrom round-trips an event', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);

    const payload = { event: 'test-event', data: JSON.stringify({ hello: 'world' }) };
    const id = await nextEventId(adapter);
    await addEventToRing(adapter, id, payload);

    // Replay with lastId = id - 1 (want events strictly after that)
    const result = await replayFrom(adapter, id - 1);

    assert.equal(result.lost, false);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].id, id);
    assert.deepEqual(result.events[0].payload, payload);

    await cleanupRing(adapter, [id]);
  });

  // 3. replayFrom with lastId strictly greater than newest returns empty list
  it('replayFrom with lastId >= newest returns empty events, lost: false', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);

    const payload = { data: '{"msg":"ping"}' };
    const id = await nextEventId(adapter);
    await addEventToRing(adapter, id, payload);

    // lastId is equal to the newest — nothing strictly after
    const result = await replayFrom(adapter, id);

    assert.equal(result.lost, false);
    assert.equal(result.events.length, 0);

    // lastId is greater than the newest — still nothing
    const result2 = await replayFrom(adapter, id + 100);
    assert.equal(result2.lost, false);
    assert.equal(result2.events.length, 0);

    await cleanupRing(adapter, [id]);
  });

  // 4. replayFrom with null lastId returns empty events, lost: false (fresh subscriber)
  it('replayFrom with null lastId returns empty events and lost: false', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);

    // Add some events to the ring
    const id1 = await nextEventId(adapter);
    await addEventToRing(adapter, id1, { data: '{"a":1}' });
    const id2 = await nextEventId(adapter);
    await addEventToRing(adapter, id2, { data: '{"b":2}' });

    const result = await replayFrom(adapter, null);

    assert.equal(result.lost, false);
    assert.equal(result.events.length, 0, 'Fresh subscriber should get no replayed events');

    await cleanupRing(adapter, [id1, id2]);
  });

  // 5. Ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE
  it('ring evicts oldest entries when size exceeds SSE_REPLAY_RING_SIZE', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);
    const prev = process.env.SSE_REPLAY_RING_SIZE;
    process.env.SSE_REPLAY_RING_SIZE = '5';
    const ids = [];
    try {
      // Push 7 events
      for (let i = 0; i < 7; i++) {
        const id = await nextEventId(adapter);
        ids.push(id);
        await addEventToRing(adapter, id, { event: 'message', data: `payload-${i}` });
      }
      const stats = await ringStats(adapter);
      assert.equal(stats.size, 5, 'ring should be capped at 5');
      assert.equal(stats.oldestId, ids[2], 'oldest after eviction should be 3rd inserted');
      assert.equal(stats.newestId, ids[6], 'newest should be 7th inserted');
    } finally {
      restoreEnv('SSE_REPLAY_RING_SIZE', prev);
      await cleanupRing(adapter, ids);
    }
  });

  // 6. replayFrom returns events strictly after Last-Event-ID in monotonic order
  it('replayFrom returns events strictly after Last-Event-ID in monotonic order', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);
    const ids = [];
    try {
      for (let i = 0; i < 5; i++) {
        const id = await nextEventId(adapter);
        ids.push(id);
        await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
      }
      const result = await replayFrom(adapter, ids[1]);  // request from ids[1] exclusive
      assert.equal(result.lost, false);
      assert.equal(result.events.length, 3, 'should return 3 events: ids[2..4]');
      assert.deepEqual(result.events.map(e => e.id), [ids[2], ids[3], ids[4]]);
      assert.equal(result.events[0].payload.data, 'p2');
    } finally {
      await cleanupRing(adapter, ids);
    }
  });

  // 7. replayFrom signals lost when Last-Event-ID is below evicted floor
  it('replayFrom signals lost when Last-Event-ID is below evicted floor', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);
    const prev = process.env.SSE_REPLAY_RING_SIZE;
    process.env.SSE_REPLAY_RING_SIZE = '3';
    const ids = [];
    try {
      for (let i = 0; i < 5; i++) {
        const id = await nextEventId(adapter);
        ids.push(id);
        await addEventToRing(adapter, id, { event: 'message', data: `p${i}` });
      }
      // ids[0] and ids[1] should now be evicted (ring kept last 3: ids[2..4])
      const result = await replayFrom(adapter, ids[0]);
      assert.equal(result.lost, true, 'lost should be true when lastId is below the floor');
      assert.equal(result.events.length, 0);
    } finally {
      restoreEnv('SSE_REPLAY_RING_SIZE', prev);
      await cleanupRing(adapter, ids);
    }
  });

  // 8. Event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive
  it('event payloads expire per SSE_REPLAY_RING_TTL_SECONDS while ring entries survive', { skip: probeFailed }, async () => {
    await cleanupRing(adapter, []);
    const prev = process.env.SSE_REPLAY_RING_TTL_SECONDS;
    process.env.SSE_REPLAY_RING_TTL_SECONDS = '1';  // 1 second
    let id;
    try {
      id = await nextEventId(adapter);
      await addEventToRing(adapter, id, { event: 'message', data: 'ephemeral' });
      // Wait 1.5s for the event payload to expire (ring zset entry persists)
      await new Promise(r => setTimeout(r, 1500));
      const result = await replayFrom(adapter, id - 1);
      // Per spec: TTL eviction past size/TTL must signal lost: true.
      // The ring zset entry still exists but the payload is gone — this is
      // treated as an unrecoverable replay loss, not a silent filter-out.
      assert.equal(result.lost, true, 'TTL-expired payload must return lost: true');
      assert.equal(result.events.length, 0, 'no events returned when payload is TTL-expired');
    } finally {
      restoreEnv('SSE_REPLAY_RING_TTL_SECONDS', prev);
      if (id != null) await cleanupRing(adapter, [id]);
    }
  });
});

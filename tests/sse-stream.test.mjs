/**
 * Smoke tests for the signalmap-stream SSE handler.
 *
 * Requires a Redis 7 server at REDIS_URL (default: redis://localhost:6380).
 * Skips cleanly when Redis is unavailable.
 *
 * To run locally:
 *   docker run -d --rm --name sigmap-test-redis -p 6380:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6380 npx tsx --test tests/sse-stream.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request } from 'node:http';
import { once } from 'node:events';

let handleSignalMapStream;
let setupSignalMapStreamShutdown;
let broadcastShutdown;
let _connectionCount;
let _jitteredRetryMs;
let importError;

// Attempt to import the module — if REDIS_URL is not set the module-level
// getRedisAdapter() singleton won't be called until handleSignalMapStream is
// actually invoked, so the import itself should always succeed.
try {
  const mod = await import('../server/api/routes/signalmap-stream.ts');
  handleSignalMapStream = mod.handleSignalMapStream;
  setupSignalMapStreamShutdown = mod.setupSignalMapStreamShutdown;
  broadcastShutdown = mod.broadcastShutdown;
  _connectionCount = mod._connectionCount;
  _jitteredRetryMs = mod._jitteredRetryMs;
} catch (err) {
  importError = err;
  console.warn('[sse-stream.test] import failed:', err?.message);
}

describe('signalmap-stream module — smoke tests', { skip: Boolean(importError) }, () => {
  // 1. handleSignalMapStream is an async function
  it('handleSignalMapStream is an async function', () => {
    assert.equal(typeof handleSignalMapStream, 'function', 'handleSignalMapStream should be a function');
    // Async functions return a Promise when called; check constructor name as a proxy
    assert.ok(
      handleSignalMapStream.constructor.name === 'AsyncFunction',
      `Expected AsyncFunction, got ${handleSignalMapStream.constructor.name}`,
    );
  });

  // 2. setupSignalMapStreamShutdown is idempotent (calling twice doesn't add multiple listeners)
  it('setupSignalMapStreamShutdown is idempotent — does not add multiple SIGTERM listeners', () => {
    // Count listeners BEFORE any call (some may already be registered from import-time side effects)
    const before = process.listenerCount('SIGTERM');

    // First call — installs one listener
    setupSignalMapStreamShutdown();
    const afterFirst = process.listenerCount('SIGTERM');

    // Second call — must be a no-op (shutdownInstalled flag)
    setupSignalMapStreamShutdown();
    const afterSecond = process.listenerCount('SIGTERM');

    // Second call must not have added another listener
    assert.equal(
      afterSecond,
      afterFirst,
      `Second call to setupSignalMapStreamShutdown added listeners (${afterFirst} → ${afterSecond})`,
    );

    // First call should have added exactly one listener (or zero if already installed
    // from a prior test run in the same process — but it must not go up on second call)
    assert.ok(
      afterFirst - before <= 1,
      `First call added more than 1 SIGTERM listener (before=${before}, after=${afterFirst})`,
    );
  });
});

// ─── Integration tests requiring live Redis ───────────────────────────────────

const REDIS_URL = process.env.REDIS_URL;
let redisAdapter;
let probeFailed = !REDIS_URL;

if (!REDIS_URL) {
  console.warn('[sse-stream.test] REDIS_URL not set — skipping integration suite');
}

const COUNTER_KEY = 'signalmap:sse:counter';
const RING_KEY = 'signalmap:sse:ring';
const EVENT_KEY_PREFIX = 'signalmap:sse:event:';

async function cleanupRing(ids) {
  await redisAdapter.del(COUNTER_KEY);
  await redisAdapter.del(RING_KEY);
  for (const id of ids) {
    await redisAdapter.del(`${EVENT_KEY_PREFIX}${id}`);
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

async function startTestServer() {
  const server = createServer((req, res) => {
    handleSignalMapStream(req, res).catch((err) => {
      console.error('[test-server] handler error:', err);
      try { res.statusCode = 500; res.end(); } catch { /* already ended */ }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, port };
}

// Import ring helpers for the integration tests
let nextEventId;
let addEventToRing;
let publishStreamEvent;
let ringStats;
try {
  const ringMod = await import('../src/server/lib/sse-replay-ring.ts');
  nextEventId = ringMod.nextEventId;
  addEventToRing = ringMod.addEventToRing;
  publishStreamEvent = ringMod.publishStreamEvent;
  ringStats = ringMod.ringStats;
} catch (err) {
  probeFailed = true;
  console.warn('[sse-stream.test] ring import failed:', err?.message);
}

describe('signalmap-stream integration — live Redis', { skip: Boolean(importError) || probeFailed }, () => {
  before(async () => {
    const { createRedisAdapter } = await import('../src/server/lib/redis.ts');
    try {
      redisAdapter = createRedisAdapter({ url: REDIS_URL });
      await redisAdapter.incr('signalmap:test:probe');
      await redisAdapter.del('signalmap:test:probe');
    } catch (err) {
      probeFailed = true;
      console.warn('[sse-stream.test] Redis unreachable, skipping:', err?.message);
    }
  });

  after(async () => {
    // Quit the test's private adapter
    if (redisAdapter) await redisAdapter.quit();
    // Also quit the singleton used internally by handleSignalMapStream —
    // ioredis subscriber connections keep the event loop alive without this.
    try {
      const { getRedisAdapter } = await import('../src/server/lib/redis.ts');
      await getRedisAdapter().quit();
    } catch { /* ignore if singleton was never initialized */ }
  });

  // 3. Jittered shutdown retry value stays in [MIN, MAX] and varies across calls
  it('jittered shutdown retry value stays in [MIN, MAX] and varies across calls', { skip: probeFailed }, () => {
    const prevMin = process.env.SSE_RECONNECT_RETRY_MIN_MS;
    const prevMax = process.env.SSE_RECONNECT_RETRY_MAX_MS;
    process.env.SSE_RECONNECT_RETRY_MIN_MS = '100';
    process.env.SSE_RECONNECT_RETRY_MAX_MS = '200';
    try {
      const samples = new Set();
      for (let i = 0; i < 50; i++) {
        const v = _jitteredRetryMs();
        assert.ok(v >= 100 && v <= 200, `value ${v} out of range`);
        samples.add(v);
      }
      assert.ok(samples.size >= 5, `expected jittered variation, got ${samples.size} unique`);
    } finally {
      restoreEnv('SSE_RECONNECT_RETRY_MIN_MS', prevMin);
      restoreEnv('SSE_RECONNECT_RETRY_MAX_MS', prevMax);
    }
  });

  // 4. handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor
  it('handleSignalMapStream replies 204 + X-Replay-Lost: true when Last-Event-ID is below floor', { skip: probeFailed }, async () => {
    await cleanupRing([]);
    const prevSize = process.env.SSE_REPLAY_RING_SIZE;
    process.env.SSE_REPLAY_RING_SIZE = '3';
    const ids = [];
    try {
      for (let i = 0; i < 5; i++) {
        const id = await nextEventId(redisAdapter);
        ids.push(id);
        await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
      }
      // ids[0] and ids[1] are now evicted; ring holds only the last 3
      const { server, port } = await startTestServer();
      try {
        // Request with Last-Event-ID = ids[0] (below the floor)
        const req = request({
          host: '127.0.0.1',
          port,
          path: '/api/signalmap/stream',
          headers: { 'Last-Event-ID': String(ids[0]) },
        });
        req.end();
        const [res] = await once(req, 'response');
        assert.equal(res.statusCode, 204);
        assert.equal(res.headers['x-replay-lost'], 'true');
        res.resume();
        await once(res, 'end');
      } finally {
        await new Promise((r) => server.close(r));
      }
    } finally {
      restoreEnv('SSE_REPLAY_RING_SIZE', prevSize);
      await cleanupRing(ids);
    }
  });

  // 5. handleSignalMapStream replays prior events as SSE frames and decrements registry on close
  it('handleSignalMapStream replays prior events as SSE frames and decrements registry on close', { skip: probeFailed }, async () => {
    await cleanupRing([]);
    const ids = [];
    try {
      for (let i = 0; i < 3; i++) {
        const id = await nextEventId(redisAdapter);
        ids.push(id);
        await addEventToRing(redisAdapter, id, { event: 'message', data: `p${i}` });
      }
      const { server, port } = await startTestServer();
      try {
        // Request from id=0 (before all inserted ids) to get full replay
        const req = request({
          host: '127.0.0.1',
          port,
          path: '/api/signalmap/stream',
          headers: { 'Last-Event-ID': '0' },
        });
        req.end();
        const [res] = await once(req, 'response');
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'text/event-stream');

        // Read enough to receive all 3 replay frames
        let buf = '';
        res.on('data', (chunk) => { buf += chunk.toString('utf8'); });
        // Wait briefly for replay frames to flush
        await new Promise(r => setTimeout(r, 300));

        // Each frame: id: <n>\nevent: message\ndata: <data>\n\n
        for (const id of ids) {
          assert.ok(buf.includes(`id: ${id}\n`), `frame for ${id} missing in: ${buf}`);
        }
        assert.ok(buf.includes('data: p0\n\n'), 'p0 frame missing');
        assert.ok(buf.includes('data: p1\n\n'), 'p1 frame missing');
        assert.ok(buf.includes('data: p2\n\n'), 'p2 frame missing');

        // Connection registry should have 1 active connection
        assert.equal(_connectionCount(), 1);

        // Close client; cleanup must remove from registry
        req.destroy();
        await new Promise(r => setTimeout(r, 150));
        assert.equal(_connectionCount(), 0);
      } finally {
        await new Promise((r) => server.close(r));
      }
    } finally {
      await cleanupRing(ids);
    }
  });

  // 6. handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence
  it('handleSignalMapStream emits heartbeat comment lines at SSE_HEARTBEAT_SECONDS cadence', { skip: probeFailed }, async () => {
    await cleanupRing([]);
    const prev = process.env.SSE_HEARTBEAT_SECONDS;
    process.env.SSE_HEARTBEAT_SECONDS = '0.05';  // 50ms cadence
    try {
      const { server, port } = await startTestServer();
      try {
        const req = request({
          host: '127.0.0.1',
          port,
          path: '/api/signalmap/stream',
        });
        req.end();
        const [res] = await once(req, 'response');
        assert.equal(res.statusCode, 200);
        let buf = '';
        res.on('data', (chunk) => { buf += chunk.toString('utf8'); });
        // Wait ~180ms — should see at least 2 heartbeats at 50ms cadence
        await new Promise(r => setTimeout(r, 200));
        const hbCount = (buf.match(/^: hb$/gm) ?? []).length;
        assert.ok(hbCount >= 2, `expected >=2 heartbeats, got ${hbCount} in: ${JSON.stringify(buf)}`);
        req.destroy();
        await new Promise(r => setTimeout(r, 100));
      } finally {
        await new Promise((r) => server.close(r));
      }
    } finally {
      restoreEnv('SSE_HEARTBEAT_SECONDS', prev);
    }
  });

  // 7 (d1). publishStreamEvent → pub/sub → SSE delivery end-to-end
  it('publishStreamEvent writes ring and delivers SSE frame to connected client', { skip: probeFailed }, async () => {
    await cleanupRing([]);
    const { server, port } = await startTestServer();
    let publishedId;
    try {
      // Open SSE connection first so the subscriber is ready
      const req = request({
        host: '127.0.0.1',
        port,
        path: '/api/signalmap/stream',
      });
      req.end();
      const [res] = await once(req, 'response');
      assert.equal(res.statusCode, 200);

      let buf = '';
      res.on('data', (chunk) => { buf += chunk.toString('utf8'); });

      // Give the handler a moment to set up its Redis subscription
      await new Promise(r => setTimeout(r, 100));

      // Publish via the canonical helper
      publishedId = await publishStreamEvent(redisAdapter, { event: 'message', data: '{"hello":"world"}' });

      // Wait briefly for the pub/sub delivery to flush through
      await new Promise(r => setTimeout(r, 300));

      // Assert SSE frame arrived
      assert.ok(buf.includes(`id: ${publishedId}\n`), `SSE id frame missing for ${publishedId} in: ${buf}`);
      assert.ok(buf.includes('event: message\n'), `SSE event field missing in: ${buf}`);
      assert.ok(buf.includes('data: {"hello":"world"}\n\n'), `SSE data field missing in: ${buf}`);

      // Assert the ring contains the published id
      const stats = await ringStats(redisAdapter);
      assert.ok(
        stats.newestId === publishedId,
        `ring newestId (${stats.newestId}) should equal publishedId (${publishedId})`,
      );

      req.destroy();
      await new Promise(r => setTimeout(r, 150));
      assert.equal(_connectionCount(), 0);
    } finally {
      await new Promise((r) => server.close(r));
      if (publishedId != null) await cleanupRing([publishedId]);
    }
  });

  // 8 (d2). broadcastShutdown emits shutdown frame and clears connection registry
  it('broadcastShutdown emits shutdown SSE frame and zeroes connection count', { skip: probeFailed }, async () => {
    await cleanupRing([]);
    const { server, port } = await startTestServer();
    try {
      const req = request({
        host: '127.0.0.1',
        port,
        path: '/api/signalmap/stream',
      });
      req.end();
      const [res] = await once(req, 'response');
      assert.equal(res.statusCode, 200);

      let buf = '';
      res.on('data', (chunk) => { buf += chunk.toString('utf8'); });

      // Wait for connection to register
      await new Promise(r => setTimeout(r, 100));
      assert.equal(_connectionCount(), 1, 'expected 1 active connection before shutdown');

      // Trigger broadcast directly (no signal needed)
      broadcastShutdown();

      // Wait for frame to flush
      await new Promise(r => setTimeout(r, 150));

      // Assert shutdown frame was sent
      assert.ok(
        /event: shutdown\nretry: \d+\n\n/.test(buf),
        `shutdown frame missing or malformed in: ${JSON.stringify(buf)}`,
      );

      // Assert connection registry is now empty
      assert.equal(_connectionCount(), 0, 'connection count should be 0 after broadcastShutdown');
    } finally {
      await new Promise((r) => server.close(r));
      await cleanupRing([]);
    }
  });
});

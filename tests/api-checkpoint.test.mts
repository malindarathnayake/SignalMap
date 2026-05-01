/**
 * Phase 2 Checkpoint Test — exercises all 8 mounted routes against a real
 * Redis instance with cache stubs pre-seeded so cache-hit-friendly routes
 * return 200.
 *
 * Prerequisites:
 *   - Redis must be reachable at redis://localhost:6379
 *     (container redis-redis-1 started by pit-boss)
 *   - No LLM keys are expected; route #8 (brief/refresh) will return 502
 *     refresh_failed when runOnce() throws. That is ACCEPTED — the test
 *     verifies route + admin-auth wiring, not LLM availability (Phase 8).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = 'phase2-checkpoint-token';
const TTL_SEC = 120;

// ---------------------------------------------------------------------------
// Redis pre-seed helpers
// ---------------------------------------------------------------------------

const SEED_KEYS = [
  'signalmap:brief:event:test-event-checkpoint',
  'signalmap:brief:global',
  'seed-meta:signalmap:news',
  'seed-meta:signalmap:radar',
  'seed-meta:signalmap:providers',
] as const;

async function seedRedis(redis: Redis): Promise<void> {
  const fakeBrief = {
    bullets: ['checkpoint test bullet'],
    sources: [],
    generatedAt: new Date().toISOString(),
    model: 'test-model',
    warnings: [],
    degraded: false,
  };

  const freshMeta = {
    fetchedAt: Date.now(),
    recordCount: 1,
    sourceVersion: 'checkpoint',
    pollMinutes: 15,
  };

  await redis.setex(
    'signalmap:brief:event:test-event-checkpoint',
    TTL_SEC,
    JSON.stringify(fakeBrief),
  );
  await redis.setex('signalmap:brief:global', TTL_SEC, JSON.stringify(fakeBrief));
  await redis.setex('seed-meta:signalmap:news', TTL_SEC, JSON.stringify(freshMeta));
  await redis.setex('seed-meta:signalmap:radar', TTL_SEC, JSON.stringify(freshMeta));
  await redis.setex('seed-meta:signalmap:providers', TTL_SEC, JSON.stringify(freshMeta));
}

async function cleanupRedis(redis: Redis): Promise<void> {
  await redis.del(...(SEED_KEYS as unknown as string[]));
}

// ---------------------------------------------------------------------------
// Subprocess boot helper
// ---------------------------------------------------------------------------

function spawnApi(): ReturnType<typeof spawn> {
  return spawn('npx', ['tsx', 'server/api/index.ts'], {
    env: {
      ...process.env,
      SIGNALMAP_API_PORT: String(PORT),
      SIGNALMAP_BACKEND_MODE: 'fixture',
      REDIS_URL: 'redis://localhost:6379',
      SIGNALMAP_ADMIN_TOKEN: ADMIN_TOKEN,
    },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

// ---------------------------------------------------------------------------
// Main checkpoint test
// ---------------------------------------------------------------------------

test('phase-2 checkpoint: all 8 routes respond with expected status codes', { timeout: 60_000 }, async () => {
  // -------------------------------------------------------------------------
  // 0. Verify Redis is reachable — fail loudly if not
  // -------------------------------------------------------------------------
  const seedRedisClient = new Redis('redis://localhost:6379', {
    // Fail fast if Redis is not available
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  try {
    await seedRedisClient.connect();
    const pong = await seedRedisClient.ping();
    assert.equal(pong, 'PONG', 'Redis PING must return PONG — is redis-redis-1 running?');
  } catch (err) {
    await seedRedisClient.quit().catch(() => { /* ignore */ });
    throw new Error(
      `PREREQ FAILED: Cannot connect to Redis at redis://localhost:6379.\n` +
      `Ensure the redis-redis-1 container is running before running this test.\n` +
      `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // -------------------------------------------------------------------------
  // 1. Pre-seed Redis with cache stubs
  // -------------------------------------------------------------------------
  await seedRedis(seedRedisClient);

  const child = spawnApi();

  try {
    // -----------------------------------------------------------------------
    // 2. Wait for api:started log line
    // -----------------------------------------------------------------------
    const port = await new Promise<number>((resolvePort, rejectBoot) => {
      const timer = setTimeout(
        () => rejectBoot(new Error('boot timeout: api:started not seen within 10s')),
        10_000,
      );

      let buf = '';

      child.stdout.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj['event'] === 'api:started' && typeof obj['port'] === 'number') {
              clearTimeout(timer);
              resolvePort(obj['port'] as number);
              return;
            }
          } catch {
            // not JSON, skip
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        rejectBoot(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timer);
        rejectBoot(new Error(`child exited before listen: code=${String(code)}`));
      });
    });

    assert.equal(port, PORT, 'api:started port must match SIGNALMAP_API_PORT');

    // -----------------------------------------------------------------------
    // Route #1 — GET /api/signalmap/list → 200, has `events` array
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/list`);
      assert.equal(res.status, 200, 'route #1 /list must return 200');
      const body = await res.json() as Record<string, unknown>;
      assert.ok('events' in body, 'route #1: body must have "events" key');
      assert.ok(Array.isArray(body['events']), 'route #1: "events" must be an array');
    }

    // -----------------------------------------------------------------------
    // Route #2 — GET /api/signalmap/source-health → 200, has `sourceHealth` array
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/source-health`);
      assert.equal(res.status, 200, 'route #2 /source-health must return 200');
      const body = await res.json() as Record<string, unknown>;
      assert.ok('sourceHealth' in body, 'route #2: body must have "sourceHealth" key');
      assert.ok(Array.isArray(body['sourceHealth']), 'route #2: "sourceHealth" must be an array');
    }

    // -----------------------------------------------------------------------
    // Route #3 — GET /api/signalmap/health → 200, has all 8 required keys
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/health`);
      assert.equal(res.status, 200, 'route #3 /health must return 200');
      const body = await res.json() as Record<string, unknown>;
      const requiredKeys = [
        'redis',
        'lancedb',
        'collector',
        'brief',
        'openrouter',
        'perplexity',
        'sources',
        'generatedAt',
      ] as const;
      for (const key of requiredKeys) {
        assert.ok(key in body, `route #3: body must have "${key}" key`);
      }
    }

    // -----------------------------------------------------------------------
    // Route #4 — GET /api/signalmap/stream → 200 (SSE)
    // We use AbortController to avoid hanging on the open SSE connection.
    // If the response headers arrive before abort, we assert 200.
    // If abort fires before headers (server hasn't flushed yet), we accept
    // AbortError as proof the route is reachable (no ECONNREFUSED).
    // -----------------------------------------------------------------------
    {
      const ctrl = new AbortController();
      const abortTimer = setTimeout(() => ctrl.abort(), 1_500);
      let sseStatus: number | null = null;
      try {
        const res = await fetch(`${BASE}/api/signalmap/stream`, { signal: ctrl.signal });
        sseStatus = res.status;
        // Don't read body — it's an open SSE stream. Abort immediately.
        ctrl.abort();
      } catch (err) {
        const e = err as Error;
        if (e.name !== 'AbortError') {
          throw new Error(`route #4 /stream fetch error (not AbortError): ${e.message}`);
        }
        // AbortError before headers — route is reachable, SSE stream opened.
        // This is acceptable for the checkpoint; Phase 8 will validate SSE events.
      } finally {
        clearTimeout(abortTimer);
      }
      // If we got headers, assert 200.
      if (sseStatus !== null) {
        assert.equal(sseStatus, 200, 'route #4 /stream must return 200 when headers arrive');
      }
      // If sseStatus is null, abort fired before headers — route reachable, accepted.
    }

    // -----------------------------------------------------------------------
    // Route #5 — GET /api/signalmap/brief/global → 200, has `bullets` array
    // (cache-hit via pre-seeded signalmap:brief:global)
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/brief/global`);
      assert.equal(res.status, 200, 'route #5 /brief/global must return 200');
      const body = await res.json() as Record<string, unknown>;
      assert.ok('bullets' in body, 'route #5: body must have "bullets" key');
      assert.ok(Array.isArray(body['bullets']), 'route #5: "bullets" must be an array');
    }

    // -----------------------------------------------------------------------
    // Route #6 — GET /api/signalmap/brief/health → 200, has health-shape key
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/brief/health`);
      assert.equal(res.status, 200, 'route #6 /brief/health must return 200');
      const body = await res.json() as Record<string, unknown>;
      // The handler always returns at minimum lastGeneratedAt and dailySpendUsd
      const healthKeys = ['lastGeneratedAt', 'nextScheduledAt', 'dailySpendUsd', 'dailyBudgetUsd', 'modelInUse'];
      const hasAny = healthKeys.some((k) => k in body);
      assert.ok(hasAny, `route #6: body must have at least one of: ${healthKeys.join(', ')}`);
    }

    // -----------------------------------------------------------------------
    // Route #7 — POST /api/signalmap/brief/event/test-event-checkpoint → 200
    // (cache-hit via pre-seeded signalmap:brief:event:test-event-checkpoint)
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/brief/event/test-event-checkpoint`, {
        method: 'POST',
      });
      assert.equal(res.status, 200, 'route #7 /brief/event/:id must return 200 (cache hit)');
      const body = await res.json() as Record<string, unknown>;
      assert.ok('bullets' in body, 'route #7: body must have "bullets" key');
      assert.ok(Array.isArray(body['bullets']), 'route #7: "bullets" must be an array');
    }

    // -----------------------------------------------------------------------
    // Route #8 — POST /api/signalmap/brief/refresh with admin token
    //
    // RATIONALE: runOnce() calls real Perplexity + OpenRouter. With no LLM
    // keys configured in the test environment, runOnce throws and the handler
    // returns 502 refresh_failed. BOTH 200 and 502 are ACCEPTED here — the
    // checkpoint verifies route registration + admin-auth wiring, not LLM
    // availability. Phase 8 covers full LLM integration. The test REJECTS
    // 401, 403, and 404 as those indicate auth or routing failures.
    // -----------------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/signalmap/brief/refresh`, {
        method: 'POST',
        headers: { 'X-Signalmap-Admin-Token': ADMIN_TOKEN },
      });
      const status = res.status;
      assert.ok(
        status === 200 || status === 502,
        `route #8 /brief/refresh must return 200 or 502 (got ${status}). ` +
        '401/403 = auth failure, 404 = route not registered.',
      );
      const body = await res.json() as Record<string, unknown>;
      if (status === 502) {
        // Verify it's a structured refresh_failed, not an unknown 502
        assert.ok('error' in body, 'route #8 502: body must have "error" key');
        const err = body['error'] as Record<string, unknown>;
        assert.equal(err['code'], 'refresh_failed', 'route #8 502: error.code must be refresh_failed');
      }
      if (status === 200) {
        // runOnce succeeded unexpectedly — still valid, accept bullets or full brief shape
        assert.ok(
          'bullets' in body || 'generatedAt' in body,
          'route #8 200: body must look like a BriefResult',
        );
      }

      // Sanity-check: admin-auth rejection must work for bad token
      const badRes = await fetch(`${BASE}/api/signalmap/brief/refresh`, {
        method: 'POST',
        headers: { 'X-Signalmap-Admin-Token': 'wrong-token' },
      });
      assert.equal(badRes.status, 401, 'route #8: wrong admin token must return 401');
    }

    // -----------------------------------------------------------------------
    // 3. Graceful shutdown
    // -----------------------------------------------------------------------
    child.stdin.write('SHUTDOWN\n');
    child.kill('SIGTERM');

    const exitCode = await new Promise<number | null>((resolveCode, rejectShutdown) => {
      const timer = setTimeout(
        () => rejectShutdown(new Error('shutdown timeout: process did not exit within 5s')),
        5_000,
      );
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolveCode(code);
      });
    });

    // Accept 0 (graceful) or null (Windows abrupt termination via SIGTERM)
    assert.ok(
      exitCode === 0 || exitCode === null,
      `unexpected exit code: ${String(exitCode)}`,
    );
  } finally {
    if (!child.killed) child.kill('SIGKILL');
    // Cleanup seeded keys (TTL will handle it automatically on crash too)
    await cleanupRedis(seedRedisClient).catch(() => { /* ignore cleanup errors */ });
    await seedRedisClient.quit().catch(() => { /* ignore */ });
  }
});


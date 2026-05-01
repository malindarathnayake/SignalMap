/**
 * Phase 7.5b — metric wiring integration tests.
 *
 * Subtest A: api emits API_REQUEST + API_ERROR metrics
 * Subtest B: collector emits COLLECTOR_TICK + COLLECTOR_EVENTS_INGESTED metrics
 *
 * Prerequisites:
 *   - Redis must be reachable at redis://localhost:6380
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waitForLine(
  proc: ReturnType<typeof spawn>,
  matcher: (obj: Record<string, unknown>) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  return new Promise<void>((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error(`Timeout waiting for "${label}" within ${timeoutMs}ms`));
    }, timeoutMs);

    let buf = '';
    const onData = (d: Buffer) => {
      buf += d.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        let obj: Record<string, unknown> | null = null;
        try {
          obj = JSON.parse(line) as Record<string, unknown>;
        } catch {
          // not JSON
        }
        if (obj !== null && matcher(obj)) {
          clearTimeout(timer);
          proc.stdout.off('data', onData);
          resolveP();
          return;
        }
      }
    };

    proc.stdout.on('data', onData);
    proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      rejectP(new Error(`Process exited (code=${String(code)}) before "${label}" was seen`));
    });
  });
}

function captureStdout(proc: ReturnType<typeof spawn>): () => string {
  const chunks: string[] = [];
  proc.stdout.on('data', (d: Buffer) => chunks.push(d.toString('utf8')));
  return () => chunks.join('');
}

async function gracefulShutdown(proc: ReturnType<typeof spawn>, timeoutMs = 8_000): Promise<number | null> {
  proc.stdin.write('SHUTDOWN\n');
  if (process.platform !== 'win32') {
    try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  return new Promise<number | null>((resolveExit) => {
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          proc.kill();
        } else {
          proc.kill('SIGKILL');
        }
      } catch { /* ignore */ }
      resolveExit(null);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
}

function parseMetricLines(stdout: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj['event'] === 'metric') {
        result.push(obj);
      }
    } catch {
      // not JSON
    }
  }
  return result;
}

// ─── Subtest A: api emits API_REQUEST + API_ERROR metrics ─────────────────────

test('api emits API_REQUEST + API_ERROR metrics', { timeout: 60_000 }, async () => {
  const proc = spawn('npx', ['tsx', 'server/api/index.ts'], {
    env: {
      ...process.env,
      SIGNALMAP_API_PORT: '3396',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      REDIS_URL: 'redis://localhost:6380',
    },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  const getStdout = captureStdout(proc);

  // Capture stderr for diagnostics
  const stderrChunks: string[] = [];
  proc.stderr.on('data', (d: Buffer) => stderrChunks.push(d.toString('utf8')));

  try {
    // Wait for api:started
    await waitForLine(
      proc,
      (obj) => obj['event'] === 'api:started',
      25_000,
      'api:started',
    );

    // Fire requests
    const listRes = await fetch('http://127.0.0.1:3396/api/signalmap/list');
    assert.equal(listRes.status, 200, '/api/signalmap/list must return 200');
    await listRes.text(); // drain body

    const missingRes = await fetch('http://127.0.0.1:3396/api/missing-route');
    assert.equal(missingRes.status, 404, '/api/missing-route must return 404');
    await missingRes.text(); // drain body

    // Shut down
    const exitCode = await gracefulShutdown(proc);
    assert.ok(
      exitCode === 0 || exitCode === null || exitCode === 1,
      `unexpected exit code: ${String(exitCode)}`,
    );

    // Parse metric lines
    const allMetrics = parseMetricLines(getStdout());

    const apiRequestLines = allMetrics.filter((m) => m['metric'] === 'signalmap.api.request');
    const apiErrorLines = allMetrics.filter((m) => m['metric'] === 'signalmap.api.error');

    // Assert: at least 2 API_REQUEST lines (one 200, one 404)
    assert.ok(
      apiRequestLines.length >= 2,
      `Expected >= 2 API_REQUEST metric lines, got ${apiRequestLines.length}.\nLines: ${JSON.stringify(apiRequestLines, null, 2)}`,
    );

    // Assert: one for /api/signalmap/list with status 200
    assert.ok(
      apiRequestLines.some(
        (line) =>
          line['method'] === 'GET' &&
          line['path'] === '/api/signalmap/list' &&
          line['status'] === 200,
      ),
      `Expected an API_REQUEST metric line for GET /api/signalmap/list status=200.\nLines: ${JSON.stringify(apiRequestLines, null, 2)}`,
    );

    // Assert: one for /api/missing-route with status 404
    assert.ok(
      apiRequestLines.some(
        (line) =>
          line['method'] === 'GET' &&
          line['path'] === '/api/missing-route' &&
          line['status'] === 404,
      ),
      `Expected an API_REQUEST metric line for GET /api/missing-route status=404.\nLines: ${JSON.stringify(apiRequestLines, null, 2)}`,
    );

    // Assert: at least 1 API_ERROR line for the 404
    assert.ok(
      apiErrorLines.length >= 1,
      `Expected >= 1 API_ERROR metric line, got ${apiErrorLines.length}.\nLines: ${JSON.stringify(apiErrorLines, null, 2)}`,
    );

    assert.ok(
      apiErrorLines.some(
        (line) =>
          line['code'] === 'not_found' &&
          line['path'] === '/api/missing-route',
      ),
      `Expected an API_ERROR metric line with code=not_found path=/api/missing-route.\nLines: ${JSON.stringify(apiErrorLines, null, 2)}`,
    );
  } finally {
    if (!proc.killed) {
      try { proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); } catch { /* ignore */ }
    }
  }
});

// ─── Subtest B: collector emits COLLECTOR_TICK + EVENTS_INGESTED metrics ──────

test('collector emits COLLECTOR_TICK + COLLECTOR_EVENTS_INGESTED metrics', { timeout: 60_000 }, async () => {
  const LEASE_KEY = 'signalmap:collector:lease';
  const HEARTBEAT_KEY = 'signalmap:collector:heartbeat';
  const STATUS_KEY = 'signalmap:collector:status';
  const TEST_KEYS = [LEASE_KEY, HEARTBEAT_KEY, STATUS_KEY];

  const redis = new Redis('redis://localhost:6380', {
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  await redis.connect();
  const pong = await redis.ping();
  assert.equal(pong, 'PONG', 'Redis PING must return PONG — is Redis running?');

  // Pre-clean keys
  await redis.del(...TEST_KEYS);

  const proc = spawn('npx', ['tsx', 'server/workers/collector.ts'], {
    env: {
      ...process.env,
      SIGNALMAP_RSS_POLL_MINUTES: '0.05',
      SIGNALMAP_COLLECTOR_LEASE_TTL_SEC: '5',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      REDIS_URL: 'redis://localhost:6380',
      SIGNALMAP_VECTOR_ENABLED: 'false',
    },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  const getStdout = captureStdout(proc);

  // Also need to attach stdout listener BEFORE waitForLine to capture all data
  const stderrChunks: string[] = [];
  proc.stderr.on('data', (d: Buffer) => stderrChunks.push(d.toString('utf8')));

  try {
    // Wait for collector-tick-success
    await waitForLine(
      proc,
      (obj) => obj['event'] === 'collector-tick-success',
      40_000,
      'collector-tick-success',
    );

    // Shut down
    const exitCode = await gracefulShutdown(proc);
    assert.ok(
      exitCode === 0 || exitCode === null || exitCode === 1,
      `unexpected exit code: ${String(exitCode)}`,
    );

    // Parse metric lines
    const allMetrics = parseMetricLines(getStdout());

    const tickLines = allMetrics.filter((m) => m['metric'] === 'signalmap.collector.tick');
    const ingestedLines = allMetrics.filter((m) => m['metric'] === 'signalmap.collector.events.ingested');

    // Assert: at least one COLLECTOR_TICK line with outcome=success
    assert.ok(
      tickLines.length >= 1,
      `Expected >= 1 COLLECTOR_TICK metric line, got ${tickLines.length}.\nLines: ${JSON.stringify(tickLines, null, 2)}\nStdout: ${getStdout()}`,
    );

    assert.ok(
      tickLines.some((line) => line['outcome'] === 'success'),
      `Expected a COLLECTOR_TICK metric line with outcome=success.\nLines: ${JSON.stringify(tickLines, null, 2)}`,
    );

    // Assert: at least one COLLECTOR_EVENTS_INGESTED line (value may be 0 in fixture mode)
    assert.ok(
      ingestedLines.length >= 1,
      `Expected >= 1 COLLECTOR_EVENTS_INGESTED metric line, got ${ingestedLines.length}.\nLines: ${JSON.stringify(ingestedLines, null, 2)}\nStdout: ${getStdout()}`,
    );
  } finally {
    // Cleanup
    if (!proc.killed) {
      try { proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); } catch { /* ignore */ }
    }
    await redis.del(...TEST_KEYS).catch(() => undefined);
    await redis.quit().catch(() => undefined);
  }
});

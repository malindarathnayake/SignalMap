/**
 * Phase 3 unit 3e — Collector fail-path test (F2 regression guard).
 *
 * Spawns collector.ts with SIGNALMAP_COLLECTOR_TEST_FAIL_TICK=1 so that
 * runCollectorTick() throws on every attempt. Asserts that:
 *   - STATUS_KEY exists with outcome=fail and errorMessage containing TEST_FAIL
 *   - HEARTBEAT_KEY exists (F2 fix: heartbeat is refreshed before the tick attempt)
 *   - LEASE_KEY still holds the worker's ownerId (lease not dropped on fail)
 *
 * Prerequisites:
 *   - Redis must be reachable at redis://localhost:6379
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const LEASE_KEY = 'signalmap:collector:lease';
const HEARTBEAT_KEY = 'signalmap:collector:heartbeat';
const STATUS_KEY = 'signalmap:collector:status';
const TEST_KEYS = [LEASE_KEY, HEARTBEAT_KEY, STATUS_KEY];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main test ────────────────────────────────────────────────────────────────

test(
  'collector worker: fail path writes outcome=fail status AND keeps heartbeat fresh (F2 regression guard)',
  { timeout: 60_000 },
  async () => {
    const redis = new Redis('redis://localhost:6379', {
      connectTimeout: 3_000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redis.connect();
    const pong = await redis.ping();
    assert.equal(pong, 'PONG', 'Redis PING must return PONG — is Redis running?');

    // Pre-clean keys to avoid ghost state from prior runs
    if (TEST_KEYS.length > 0) {
      await redis.del(...TEST_KEYS);
    }

    const proc = spawn(
      'npx',
      ['tsx', 'server/workers/collector.ts'],
      {
        env: {
          ...process.env,
          SIGNALMAP_RSS_POLL_MINUTES: '0.05',
          SIGNALMAP_COLLECTOR_LEASE_TTL_SEC: '5',
          SIGNALMAP_BACKEND_MODE: 'fixture',
          REDIS_URL: 'redis://localhost:6379',
          SIGNALMAP_VECTOR_ENABLED: 'false',
          SIGNALMAP_COLLECTOR_TEST_FAIL_TICK: '1',
        },
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    let failLine: Record<string, unknown> | null = null;
    let capturedOwnerId: string | null = null;

    // Capture stderr for diagnostics
    proc.stderr.on('data', (d: Buffer) => {
      stderrLines.push(d.toString('utf8'));
    });

    try {
      // ── 1. Wait for collector-tick-fail within 25 s ────────────────────────
      await new Promise<void>((resolveP, rejectP) => {
        const timer = setTimeout(() => {
          const combined =
            'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(
            new Error(
              `collector-tick-fail not seen within 25s.\n${combined}`,
            ),
          );
        }, 25_000);

        let buf = '';

        proc.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf8');
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            stdoutLines.push(line + '\n');
            if (line.trim() === '') continue;
            let obj: Record<string, unknown> | null = null;
            try {
              obj = JSON.parse(line) as Record<string, unknown>;
            } catch {
              // not JSON — skip
            }
            if (obj === null) continue;

            // Capture ownerId from collector-started line
            if (obj['event'] === 'collector-started' && typeof obj['ownerId'] === 'string') {
              capturedOwnerId = obj['ownerId'] as string;
            }

            if (obj['event'] === 'collector-tick-fail') {
              failLine = obj;
              clearTimeout(timer);
              resolveP();
              return;
            }
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          rejectP(err);
        });

        proc.on('exit', (code) => {
          clearTimeout(timer);
          if (failLine === null) {
            rejectP(
              new Error(
                `collector process exited (code=${String(code)}) before emitting collector-tick-fail.\n` +
                  'STDOUT:\n' + stdoutLines.join('') +
                  '\nSTDERR:\n' + stderrLines.join(''),
              ),
            );
          }
        });
      });

      // ── Assertion 1: fail line seen ────────────────────────────────────────
      assert.ok(failLine !== null, 'collector-tick-fail log line must be emitted');
      const failError = (failLine as Record<string, unknown>)['error'];
      assert.ok(
        typeof failError === 'string' && failError.includes('TEST_FAIL'),
        `collector-tick-fail error must contain 'TEST_FAIL', got: ${String(failError)}`,
      );

      // Brief pause to allow async Redis writes to settle
      await wait(300);

      // ── Assertion 2: STATUS_KEY has outcome=fail with correct errorMessage ──
      const rawStatus = await redis.get(STATUS_KEY);
      assert.ok(rawStatus !== null, 'signalmap:collector:status must exist in Redis after tick-fail');
      const status = JSON.parse(rawStatus) as Record<string, unknown>;
      assert.equal(status['outcome'], 'fail', 'status.outcome must be "fail"');
      assert.ok(
        typeof status['errorMessage'] === 'string',
        'status.errorMessage must be a string',
      );
      assert.ok(
        (status['errorMessage'] as string).includes('TEST_FAIL'),
        `status.errorMessage must contain 'TEST_FAIL', got: ${String(status['errorMessage'])}`,
      );

      // ── Assertion 3: HEARTBEAT_KEY exists (F2 fix regression guard) ─────────
      const rawHeartbeat = await redis.get(HEARTBEAT_KEY);
      assert.ok(
        rawHeartbeat !== null,
        'signalmap:collector:heartbeat must exist even after a tick failure (F2 fix)',
      );
      const heartbeat = JSON.parse(rawHeartbeat) as Record<string, unknown>;
      assert.ok(typeof heartbeat['pid'] === 'number', 'heartbeat.pid must be a number');
      assert.ok(typeof heartbeat['ts'] === 'number', 'heartbeat.ts must be a number');
      assert.ok(typeof heartbeat['ownerId'] === 'string', 'heartbeat.ownerId must be a string');

      // ── Assertion 4: LEASE_KEY still held by this worker ──────────────────
      const rawLease = await redis.get(LEASE_KEY);
      assert.ok(rawLease !== null, 'signalmap:collector:lease must exist while worker is running');
      if (capturedOwnerId !== null) {
        assert.equal(
          rawLease,
          capturedOwnerId,
          'lease value must equal the worker ownerId even after fail',
        );
      }

      // ── Assertion 5: SIGTERM — process exits cleanly ───────────────────────
      proc.stdin.write('SHUTDOWN\n');
      if (process.platform !== 'win32') {
        proc.kill('SIGTERM');
      }

      const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        const exitTimer = setTimeout(async () => {
          if (process.platform === 'win32') {
            proc.kill();
          } else {
            proc.kill('SIGKILL');
          }
          rejectExit(new Error('collector did not exit within 8s after SIGTERM'));
        }, 8_000);

        proc.on('close', (code) => {
          clearTimeout(exitTimer);
          resolveExit(code);
        });
      });

      assert.ok(
        exitCode === 0 || exitCode === null || exitCode === 1,
        `unexpected exit code after SIGTERM: ${String(exitCode)}`,
      );
    } finally {
      // Always clean up: kill child if still alive, delete test keys, quit redis
      if (!proc.killed) {
        try {
          proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        } catch {
          // ignore
        }
      }
      await redis.del(...TEST_KEYS).catch(() => undefined);
      await redis.quit().catch(() => undefined);
    }
  },
);

/**
 * Phase 3 unit 3b — Collector worker boot test.
 *
 * Spawns collector.ts as a subprocess, waits for collector-tick-success,
 * inspects Redis state, verifies SIGTERM / lease release.
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
  'collector worker: boots, writes heartbeat/status/lease, shuts down cleanly',
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
        },
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    let successLine: Record<string, unknown> | null = null;
    let capturedOwnerId: string | null = null;

    // Capture stderr for diagnostics
    proc.stderr.on('data', (d: Buffer) => {
      stderrLines.push(d.toString('utf8'));
    });

    try {
      // ── 1. Wait for collector-tick-success within 25 s ─────────────────────
      await new Promise<void>((resolveP, rejectP) => {
        const timer = setTimeout(() => {
          const combined =
            'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(
            new Error(
              `collector-tick-success not seen within 25s.\n${combined}`,
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

            if (obj['event'] === 'collector-tick-success') {
              successLine = obj;
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
          if (successLine === null) {
            rejectP(
              new Error(
                `collector process exited (code=${String(code)}) before emitting collector-tick-success.\n` +
                  'STDOUT:\n' + stdoutLines.join('') +
                  '\nSTDERR:\n' + stderrLines.join(''),
              ),
            );
          }
        });
      });

      // ── Assertion 1: success line seen ─────────────────────────────────────
      assert.ok(successLine !== null, 'collector-tick-success log line must be emitted');
      const eventCount = (successLine as Record<string, unknown>)['eventCount'];
      // eventCount MAY be 0 — acceptable. Just record it.
      assert.ok(
        typeof eventCount === 'number',
        `eventCount must be a number, got ${String(eventCount)}`,
      );

      // ── Assertion 2: heartbeat key ─────────────────────────────────────────
      const rawHeartbeat = await redis.get(HEARTBEAT_KEY);
      assert.ok(rawHeartbeat !== null, 'signalmap:collector:heartbeat must exist in Redis');
      const heartbeat = JSON.parse(rawHeartbeat) as Record<string, unknown>;
      assert.ok(typeof heartbeat['pid'] === 'number', 'heartbeat.pid must be a number');
      assert.ok(typeof heartbeat['ts'] === 'number', 'heartbeat.ts must be a number');

      // ── Assertion 3: status key ────────────────────────────────────────────
      const rawStatus = await redis.get(STATUS_KEY);
      assert.ok(rawStatus !== null, 'signalmap:collector:status must exist in Redis');
      const status = JSON.parse(rawStatus) as Record<string, unknown>;
      assert.equal(status['outcome'], 'success', 'status.outcome must be "success"');
      assert.ok(typeof status['eventCount'] === 'number', 'status.eventCount must be a number');
      assert.ok(typeof status['ts'] === 'number', 'status.ts must be a number');

      // ── Assertion 4: lease key exists while process is running ─────────────
      const rawLease = await redis.get(LEASE_KEY);
      assert.ok(rawLease !== null, 'signalmap:collector:lease must exist while worker is running');
      if (capturedOwnerId !== null) {
        assert.equal(
          rawLease,
          capturedOwnerId,
          'lease value must equal the worker ownerId',
        );
      }

      // ── Assertion 5: SIGTERM — process exits cleanly ───────────────────────
      // Trigger graceful shutdown via stdin (cross-platform).
      // On Windows with shell:true, proc.kill() terminates the cmd.exe wrapper
      // immediately and orphans the Node process — so we rely on the stdin
      // SHUTDOWN signal alone to drive graceful exit (lease release included).
      // On POSIX, belt-and-suspenders: stdin + SIGTERM.
      proc.stdin.write('SHUTDOWN\n');
      if (process.platform !== 'win32') {
        proc.kill('SIGTERM');
      }

      const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        const exitTimer = setTimeout(async () => {
          // Force-kill on timeout
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

      // Brief pause to allow async lease release to land in Redis
      await wait(500);

      // ── Assertion 6: lease key released after exit ─────────────────────────
      const leaseExists = await redis.exists(LEASE_KEY);
      assert.equal(leaseExists, 0, 'signalmap:collector:lease must be deleted after clean shutdown');
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

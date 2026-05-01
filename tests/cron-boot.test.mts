/**
 * Phase 4 unit 4a — Cron worker boot test.
 *
 * Spawns cron.ts as a subprocess with fixture mode enabled, waits for
 * cron-tick-success, inspects Redis state (heartbeat/status/lease/brief),
 * verifies SIGTERM / lease release.
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

const LEASE_KEY = 'signalmap:brief:cron:lease';
const HEARTBEAT_KEY = 'signalmap:brief:cron:heartbeat';
const STATUS_KEY = 'signalmap:brief:cron:status';
const BRIEF_GLOBAL_KEY = 'signalmap:brief:global';
const TEST_KEYS = [LEASE_KEY, HEARTBEAT_KEY, STATUS_KEY, BRIEF_GLOBAL_KEY];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main test ────────────────────────────────────────────────────────────────

test(
  'cron worker: boots, writes heartbeat/status/lease/brief, shuts down cleanly',
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

    // Also clean spend key so budget doesn't exhaust across runs
    const today = new Date().toISOString().slice(0, 10);
    const spendKey = `signalmap:llm:spend:${today}`;
    await redis.del(spendKey);

    const proc = spawn(
      'npx',
      ['tsx', 'server/workers/cron.ts'],
      {
        env: {
          ...process.env,
          SIGNALMAP_BRIEF_REFRESH_MINUTES: '0.05',  // ~3s
          SIGNALMAP_CRON_LEASE_TTL_SEC: '5',
          SIGNALMAP_BACKEND_MODE: 'fixture',
          SIGNALMAP_CRON_TEST_FIXTURE: '1',
          REDIS_URL: 'redis://localhost:6379',
          OPENROUTER_API_KEY: 'test-key',
          SIGNALMAP_DAILY_LLM_BUDGET_USD: '100',
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
      // ── 1. Wait for cron-tick-success within 25 s ──────────────────────────
      await new Promise<void>((resolveP, rejectP) => {
        const timer = setTimeout(() => {
          const combined =
            'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(
            new Error(
              `cron-tick-success not seen within 25s.\n${combined}`,
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

            // Capture ownerId from cron-started line
            if (obj['event'] === 'cron-started' && typeof obj['ownerId'] === 'string') {
              capturedOwnerId = obj['ownerId'] as string;
            }

            if (obj['event'] === 'cron-tick-success') {
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
                `cron process exited (code=${String(code)}) before emitting cron-tick-success.\n` +
                  'STDOUT:\n' + stdoutLines.join('') +
                  '\nSTDERR:\n' + stderrLines.join(''),
              ),
            );
          }
        });
      });

      // ── Assertion 1: success line seen ─────────────────────────────────────
      assert.ok(successLine !== null, 'cron-tick-success log line must be emitted');
      const eventCount = (successLine as Record<string, unknown>)['eventCount'];
      assert.ok(
        typeof eventCount === 'number',
        `eventCount must be a number, got ${String(eventCount)}`,
      );
      assert.equal(eventCount, 1, `eventCount must equal 1 for cron, got ${String(eventCount)}`);

      // ── Assertion 2: heartbeat key ─────────────────────────────────────────
      const rawHeartbeat = await redis.get(HEARTBEAT_KEY);
      assert.ok(rawHeartbeat !== null, 'signalmap:brief:cron:heartbeat must exist in Redis');
      const heartbeat = JSON.parse(rawHeartbeat) as Record<string, unknown>;
      assert.ok(typeof heartbeat['pid'] === 'number', 'heartbeat.pid must be a number');
      assert.ok(typeof heartbeat['ts'] === 'number', 'heartbeat.ts must be a number');
      assert.ok(typeof heartbeat['ownerId'] === 'string', 'heartbeat.ownerId must be a string');

      // ── Assertion 3: status key ────────────────────────────────────────────
      const rawStatus = await redis.get(STATUS_KEY);
      assert.ok(rawStatus !== null, 'signalmap:brief:cron:status must exist in Redis');
      const status = JSON.parse(rawStatus) as Record<string, unknown>;
      assert.equal(status['outcome'], 'success', 'status.outcome must be "success"');
      assert.equal(status['eventCount'], 1, 'status.eventCount must equal 1');
      assert.ok(typeof status['ts'] === 'number', 'status.ts must be a number');

      // ── Assertion 4: lease key exists while process is running ─────────────
      const rawLease = await redis.get(LEASE_KEY);
      assert.ok(rawLease !== null, 'signalmap:brief:cron:lease must exist while worker is running');
      if (capturedOwnerId !== null) {
        assert.equal(
          rawLease,
          capturedOwnerId,
          'lease value must equal the worker ownerId',
        );
      }

      // ── Assertion 5: brief:global key written ─────────────────────────────
      const rawBrief = await redis.get(BRIEF_GLOBAL_KEY);
      assert.ok(rawBrief !== null, 'signalmap:brief:global must exist after first tick-success');
      const brief = JSON.parse(rawBrief) as Record<string, unknown>;
      assert.ok(Array.isArray(brief['bullets']), 'brief.bullets must be an array');
      assert.ok(
        (brief['bullets'] as unknown[]).length >= 1,
        `brief.bullets must have ≥1 entry, got ${String((brief['bullets'] as unknown[]).length)}`,
      );

      // ── Assertion 6: SIGTERM — process exits cleanly ───────────────────────
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
          rejectExit(new Error('cron did not exit within 8s after SIGTERM'));
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

      // ── Assertion 7: lease key released after exit ─────────────────────────
      const leaseExists = await redis.exists(LEASE_KEY);
      assert.equal(leaseExists, 0, 'signalmap:brief:cron:lease must be deleted after clean shutdown');
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

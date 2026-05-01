/**
 * Phase 3 unit 3e — Collector lost-lease test (F1+F3b regression guard).
 *
 * Spawns collector.ts with a short LEASE_TTL_SEC (4s) so the renewal timer
 * fires every 2s. After the first tick-success, the test externally DELs the
 * lease key. Asserts the collector detects this via the renewal callback,
 * emits 'collector-lease-lost', then re-acquires and emits a second
 * 'collector-tick-success'.
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
  'collector worker: detects external lease deletion, logs collector-lease-lost, re-acquires and ticks again (F1+F3b regression guard)',
  { timeout: 90_000 },
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
          // 30s poll — long enough that renewal timer fires during inter-tick sleep (F1 proof)
          SIGNALMAP_RSS_POLL_MINUTES: '0.5',
          // 4s lease TTL — renewal at 2s, so a DEL'd lease takes ≤2s to detect
          SIGNALMAP_COLLECTOR_LEASE_TTL_SEC: '4',
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

    // Capture stderr for diagnostics
    proc.stderr.on('data', (d: Buffer) => {
      stderrLines.push(d.toString('utf8'));
    });

    // State machine — single stdout handler for the entire test flow
    type Phase =
      | 'awaiting-started'
      | 'awaiting-first-tick'
      | 'awaiting-lease-lost'
      | 'awaiting-second-tick'
      | 'done';

    let phase: Phase = 'awaiting-started';
    let capturedOwnerId: string | null = null;
    let firstTickLine: Record<string, unknown> | null = null;
    let leaseLostLine: Record<string, unknown> | null = null;
    let secondTickLine: Record<string, unknown> | null = null;

    // Resolve/reject handles for each phase promise
    let resolveStarted!: () => void;
    let rejectStarted!: (err: Error) => void;
    let resolveFirstTick!: () => void;
    let rejectFirstTick!: (err: Error) => void;
    let resolveLeaseLost!: () => void;
    let rejectLeaseLost!: (err: Error) => void;
    let resolveSecondTick!: () => void;
    let rejectSecondTick!: (err: Error) => void;

    const startedP = new Promise<void>((res, rej) => {
      resolveStarted = res;
      rejectStarted = rej;
    });
    const firstTickP = new Promise<void>((res, rej) => {
      resolveFirstTick = res;
      rejectFirstTick = rej;
    });
    const leaseLostP = new Promise<void>((res, rej) => {
      resolveLeaseLost = res;
      rejectLeaseLost = rej;
    });
    const secondTickP = new Promise<void>((res, rej) => {
      resolveSecondTick = res;
      rejectSecondTick = rej;
    });

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

        if (phase === 'awaiting-started') {
          if (obj['event'] === 'collector-started' && typeof obj['ownerId'] === 'string') {
            capturedOwnerId = obj['ownerId'] as string;
            phase = 'awaiting-first-tick';
            resolveStarted();
          }
        } else if (phase === 'awaiting-first-tick') {
          if (obj['event'] === 'collector-tick-success') {
            firstTickLine = obj;
            phase = 'awaiting-lease-lost';
            resolveFirstTick();
          }
        } else if (phase === 'awaiting-lease-lost') {
          if (obj['event'] === 'collector-lease-lost') {
            leaseLostLine = obj;
            phase = 'awaiting-second-tick';
            resolveLeaseLost();
          }
        } else if (phase === 'awaiting-second-tick') {
          if (obj['event'] === 'collector-tick-success') {
            secondTickLine = obj;
            phase = 'done';
            resolveSecondTick();
          }
        }
      }
    });

    proc.on('error', (err) => {
      const e = new Error(`collector spawn error: ${err.message}`);
      rejectStarted(e);
      rejectFirstTick(e);
      rejectLeaseLost(e);
      rejectSecondTick(e);
    });

    proc.on('exit', (code) => {
      if (phase !== 'done') {
        const combined =
          'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
        const e = new Error(
          `collector process exited (code=${String(code)}) during phase '${phase}'.\n${combined}`,
        );
        rejectStarted(e);
        rejectFirstTick(e);
        rejectLeaseLost(e);
        rejectSecondTick(e);
      }
    });

    try {
      // ── Step 1: Wait for collector-started (≤25s) ──────────────────────────
      await Promise.race([
        startedP,
        new Promise<never>((_, rej) =>
          setTimeout(() => {
            const combined =
              'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rej(new Error(`collector-started not seen within 25s.\n${combined}`));
          }, 25_000),
        ),
      ]);

      assert.ok(capturedOwnerId !== null, 'must have captured ownerId from collector-started');

      // ── Step 2: Wait for first collector-tick-success (≤25s) ───────────────
      await Promise.race([
        firstTickP,
        new Promise<never>((_, rej) =>
          setTimeout(() => {
            const combined =
              'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rej(new Error(`first collector-tick-success not seen within 25s.\n${combined}`));
          }, 25_000),
        ),
      ]);

      assert.ok(firstTickLine !== null, 'first collector-tick-success must be emitted');

      // ── Step 3: Externally DEL the lease key ───────────────────────────────
      await redis.del(LEASE_KEY);

      // ── Step 4: Wait for collector-lease-lost (≤8s) ────────────────────────
      await Promise.race([
        leaseLostP,
        new Promise<never>((_, rej) =>
          setTimeout(() => {
            const combined =
              'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rej(new Error(`collector-lease-lost not seen within 8s after DEL.\n${combined}`));
          }, 8_000),
        ),
      ]);

      assert.ok(leaseLostLine !== null, 'collector-lease-lost must be emitted');
      assert.equal(
        (leaseLostLine as Record<string, unknown>)['ownerId'],
        capturedOwnerId,
        'collector-lease-lost ownerId must match captured ownerId',
      );
      assert.ok(
        typeof (leaseLostLine as Record<string, unknown>)['ts'] === 'string',
        'collector-lease-lost ts must be an ISO string',
      );

      // ── Step 5: Wait for second collector-tick-success (≤25s) ──────────────
      await Promise.race([
        secondTickP,
        new Promise<never>((_, rej) =>
          setTimeout(() => {
            const combined =
              'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rej(new Error(`second collector-tick-success not seen within 25s after lease-lost.\n${combined}`));
          }, 25_000),
        ),
      ]);

      assert.ok(secondTickLine !== null, 'second collector-tick-success must be emitted');

      // Brief pause to allow async Redis write to settle
      await wait(300);

      // ── Assertion: LEASE_KEY exists after re-acquisition ───────────────────
      const rawLease = await redis.get(LEASE_KEY);
      assert.ok(
        rawLease !== null,
        'signalmap:collector:lease must exist after collector re-acquired the lease',
      );

      // ── Shutdown ───────────────────────────────────────────────────────────
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

/**
 * Phase 4 unit 4c — Cron SSE publish test.
 *
 * Subscribes to signalmap:brief:updated before spawning the cron worker, then
 * asserts that at least one 'updated' message is published during a tick.
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
const BRIEF_UPDATED_CHANNEL = 'signalmap:brief:updated';
const TEST_KEYS = [LEASE_KEY, HEARTBEAT_KEY, STATUS_KEY, BRIEF_GLOBAL_KEY];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test(
  'cron worker: publishes bare frame to signalmap:brief:updated channel after successful tick',
  { timeout: 60_000 },
  async () => {
    // ── Set up Redis clients ─────────────────────────────────────────────────
    const client = new Redis('redis://localhost:6379', {
      connectTimeout: 3_000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    const subscriber = new Redis('redis://localhost:6379', {
      connectTimeout: 3_000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await client.connect();
    const pong = await client.ping();
    assert.equal(pong, 'PONG', 'Redis PING must return PONG — is Redis running?');

    await subscriber.connect();

    // ── Pre-clean Redis keys ─────────────────────────────────────────────────
    await client.del(...TEST_KEYS);

    // Also clean spend key so budget doesn't exhaust across runs
    const today = new Date().toISOString().slice(0, 10);
    const spendKey = `signalmap:llm:spend:${today}`;
    await client.del(spendKey);

    // ── Subscribe BEFORE spawning the worker ────────────────────────────────
    const receivedMessages: string[] = [];
    await subscriber.subscribe(BRIEF_UPDATED_CHANNEL);
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === BRIEF_UPDATED_CHANNEL) {
        receivedMessages.push(message);
      }
    });

    // ── Spawn worker ─────────────────────────────────────────────────────────
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

    proc.stderr.on('data', (d: Buffer) => {
      stderrLines.push(d.toString('utf8'));
    });

    let successLine: Record<string, unknown> | null = null;

    try {
      // ── Wait for cron-tick-success (up to 45 s) ───────────────────────────
      await new Promise<void>((resolveP, rejectP) => {
        const timer = setTimeout(() => {
          const combined =
            'STDOUT:\n' + stdoutLines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(
            new Error(`cron-tick-success not seen within 45s.\n${combined}`),
          );
        }, 45_000);

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

      assert.ok(successLine !== null, 'cron-tick-success log line must be emitted');

      // Give a short grace period for the Redis publish to reach the subscriber
      await wait(500);

      // ── Assert channel message received ───────────────────────────────────
      assert.ok(
        receivedMessages.length >= 1,
        `Expected ≥1 message on ${BRIEF_UPDATED_CHANNEL}, got 0. ` +
        `successLine=${JSON.stringify(successLine)}`,
      );

      assert.equal(
        receivedMessages[0],
        'updated',
        `Expected 'updated' string on ${BRIEF_UPDATED_CHANNEL}, got: ${String(receivedMessages[0])}`,
      );

    } finally {
      // ── Cross-platform shutdown ───────────────────────────────────────────
      proc.stdin.write('SHUTDOWN\n');
      if (process.platform !== 'win32') {
        proc.kill('SIGTERM');
      }

      await new Promise<void>((resolveExit) => {
        const exitTimer = setTimeout(() => {
          try {
            if (process.platform === 'win32') {
              proc.kill();
            } else {
              proc.kill('SIGKILL');
            }
          } catch {
            // ignore
          }
          resolveExit();
        }, 8_000);

        proc.on('close', () => {
          clearTimeout(exitTimer);
          resolveExit();
        });
      });

      // ── Cleanup ───────────────────────────────────────────────────────────
      await subscriber.quit().catch(() => undefined);
      await client.del(...TEST_KEYS).catch(() => undefined);
      await client.quit().catch(() => undefined);
      if (!proc.killed) {
        try {
          proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  },
);

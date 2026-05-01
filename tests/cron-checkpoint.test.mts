/**
 * Phase 4 unit 4d — Cron checkpoint test.
 *
 * ≥2 successful cron ticks, lease renewal proven (mid-run lease ownerId still
 * equals captured ownerId despite LEASE_TTL < cumulative wait), heartbeat fresh,
 * brief written to signalmap:brief:global, ≥2 messages on signalmap:brief:updated.
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

// ─── Persistent single-listener stdout parser ────────────────────────────────

type EventCallback = (obj: Record<string, unknown>) => void;

interface ProcessParser {
  lines: string[];
  events: Record<string, unknown>[];
  /** Wait for the Nth occurrence (1-based) of an event name. */
  waitForNthEvent(name: string, n: number, timeoutMs: number): Promise<Record<string, unknown>>;
  countEvents(name: string): number;
  hasEvent(name: string): boolean;
  getFirst(name: string): Record<string, unknown> | undefined;
}

/**
 * Attach a single persistent line-by-line JSON parser to proc.stdout.
 * All event observations go through one listener to avoid double-processing.
 */
function attachStdoutParser(
  proc: ReturnType<typeof spawn>,
  stderrLines: string[],
): ProcessParser {
  const lines: string[] = [];
  const events: Record<string, unknown>[] = [];

  const waiters: Map<string, Array<{ minCount: number; resolve: EventCallback; timer: ReturnType<typeof setTimeout> }>> = new Map();

  proc.stderr.on('data', (d: Buffer) => { stderrLines.push(d.toString('utf8')); });

  let buf = '';
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';

    for (const line of parts) {
      lines.push(line + '\n');
      if (line.trim() === '') continue;
      let obj: Record<string, unknown> | null = null;
      try { obj = JSON.parse(line) as Record<string, unknown>; } catch { /* not JSON */ }
      if (obj === null) continue;

      events.push(obj);
      const evName = typeof obj['event'] === 'string' ? obj['event'] : null;
      if (evName !== null) {
        const currentCount = events.filter((e) => e['event'] === evName).length;
        const pending = waiters.get(evName);
        if (pending) {
          const remaining: typeof pending = [];
          for (const w of pending) {
            if (currentCount >= w.minCount) {
              clearTimeout(w.timer);
              w.resolve(obj);
            } else {
              remaining.push(w);
            }
          }
          if (remaining.length === 0) {
            waiters.delete(evName);
          } else {
            waiters.set(evName, remaining);
          }
        }
      }
    }
  });

  return {
    lines,
    events,
    waitForNthEvent(name: string, n: number, timeoutMs: number): Promise<Record<string, unknown>> {
      return new Promise<Record<string, unknown>>((resolveP, rejectP) => {
        const existing = events.filter((e) => e['event'] === name);
        if (existing.length >= n) {
          resolveP(existing[n - 1]!);
          return;
        }
        // eslint-disable-next-line prefer-const
        let entry: { minCount: number; resolve: EventCallback; timer: ReturnType<typeof setTimeout> };
        const timer = setTimeout(() => {
          const pending = waiters.get(name);
          if (pending) {
            const idx = pending.indexOf(entry);
            if (idx >= 0) pending.splice(idx, 1);
            if (pending.length === 0) waiters.delete(name);
          }
          rejectP(new Error(`Timed out waiting for event '${name}' (occurrence ${n}) after ${timeoutMs}ms`));
        }, timeoutMs);

        entry = { minCount: n, resolve: resolveP as EventCallback, timer };
        const existing2 = waiters.get(name);
        if (existing2) {
          existing2.push(entry);
        } else {
          waiters.set(name, [entry]);
        }
      });
    },
    countEvents(name: string): number {
      return events.filter((e) => e['event'] === name).length;
    },
    hasEvent(name: string): boolean {
      return events.some((e) => e['event'] === name);
    },
    getFirst(name: string): Record<string, unknown> | undefined {
      return events.find((e) => e['event'] === name);
    },
  };
}

// ─── Checkpoint test ──────────────────────────────────────────────────────────

test(
  'cron checkpoint: ≥2 ticks, lease renewed, heartbeat fresh, ≥2 brief:updated messages',
  { timeout: 90_000 },
  async () => {
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
    assert.equal(await client.ping(), 'PONG', 'Redis PING must return PONG');
    await subscriber.connect();

    // Pre-clean keys to avoid ghost state from prior runs
    await client.del(...TEST_KEYS);

    // Also clean spend key so budget doesn't exhaust across runs
    const today = new Date().toISOString().slice(0, 10);
    const spendKey = `signalmap:llm:spend:${today}`;
    await client.del(spendKey);

    // ── Subscribe BEFORE spawn ────────────────────────────────────────────────
    const receivedMessages: string[] = [];
    await subscriber.subscribe(BRIEF_UPDATED_CHANNEL);
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === BRIEF_UPDATED_CHANNEL) {
        receivedMessages.push(message);
      }
    });

    // ── Spawn cron worker ─────────────────────────────────────────────────────
    const proc = spawn(
      'npx',
      ['tsx', 'server/workers/cron.ts'],
      {
        env: {
          ...process.env,
          SIGNALMAP_BRIEF_REFRESH_MINUTES: '0.1',  // 6s — fast enough to see ≥2 ticks in budget
          SIGNALMAP_CRON_LEASE_TTL_SEC: '5',  // shorter than cumulative wait → renewal must fire
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

    const stderrLines: string[] = [];
    const parser = attachStdoutParser(proc, stderrLines);
    let capturedOwnerId: string | null = null;

    try {
      // ── Wait for 2nd tick-success within 30 s ─────────────────────────────
      const secondTick = await new Promise<Record<string, unknown>>((resolveP, rejectP) => {
        const hardTimer = setTimeout(() => {
          const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(new Error(`≥2 cron-tick-success not seen within 30s.\n${combined}`));
        }, 30_000);

        parser.waitForNthEvent('cron-tick-success', 2, 29_000)
          .then((ev) => { clearTimeout(hardTimer); resolveP(ev); })
          .catch((err: unknown) => {
            clearTimeout(hardTimer);
            const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rejectP(new Error(`${String(err)}\n${combined}`));
          });

        proc.on('error', (err) => { clearTimeout(hardTimer); rejectP(err); });
        proc.on('exit', (code) => {
          clearTimeout(hardTimer);
          if (parser.countEvents('cron-tick-success') < 2) {
            const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rejectP(new Error(
              `cron exited (code=${String(code)}) before 2nd tick-success.\n${combined}`,
            ));
          }
        });
      });

      void secondTick;

      // Capture ownerId from cron-started
      const startedEv = parser.getFirst('cron-started');
      capturedOwnerId = startedEv && typeof startedEv['ownerId'] === 'string'
        ? (startedEv['ownerId'] as string)
        : null;

      // ── Assertion 1: ≥2 ticks ─────────────────────────────────────────────
      assert.ok(
        parser.countEvents('cron-tick-success') >= 2,
        `Expected ≥2 tick-success events, got ${parser.countEvents('cron-tick-success')}`,
      );

      // ── Assertion 2: lease renewal proven ────────────────────────────────
      // At this point (after 2nd tick at 6s intervals, LEASE_TTL=5s), the lease
      // must have been renewed — without renewal it would have expired by now.
      const midLeaseValue = await client.get(LEASE_KEY);
      assert.ok(
        midLeaseValue !== null,
        'signalmap:brief:cron:lease must still exist after 2nd tick (renewal must have fired)',
      );
      if (capturedOwnerId !== null) {
        assert.equal(
          midLeaseValue,
          capturedOwnerId,
          `lease must equal original ownerId (proves renewal). midLeaseValue=${String(midLeaseValue)}, ownerId=${capturedOwnerId}`,
        );
      }

      // ── Assertion 3: heartbeat key is fresh ──────────────────────────────
      const rawHeartbeat = await client.get(HEARTBEAT_KEY);
      assert.ok(rawHeartbeat !== null, 'signalmap:brief:cron:heartbeat must exist after 2nd tick');
      const heartbeat = JSON.parse(rawHeartbeat) as Record<string, unknown>;
      assert.ok(typeof heartbeat['pid'] === 'number', 'heartbeat.pid must be a number');
      assert.ok(typeof heartbeat['ts'] === 'number', 'heartbeat.ts must be a number');
      assert.ok(typeof heartbeat['ownerId'] === 'string', 'heartbeat.ownerId must be a string');
      const heartbeatAge = Date.now() - (heartbeat['ts'] as number);
      assert.ok(heartbeatAge < 15_000, `heartbeat.ts must be within last 15s. Age: ${heartbeatAge}ms`);

      // ── Assertion 4: status key ───────────────────────────────────────────
      const rawStatus = await client.get(STATUS_KEY);
      assert.ok(rawStatus !== null, 'signalmap:brief:cron:status must exist after 2nd tick');
      const status = JSON.parse(rawStatus) as Record<string, unknown>;
      assert.equal(
        status['outcome'],
        'success',
        `status.outcome must be "success", got ${String(status['outcome'])}`,
      );
      assert.equal(
        status['eventCount'],
        1,
        `status.eventCount must be 1, got ${String(status['eventCount'])}`,
      );

      // ── Assertion 5: brief:global written ─────────────────────────────────
      const rawBrief = await client.get(BRIEF_GLOBAL_KEY);
      assert.ok(rawBrief !== null, 'signalmap:brief:global must exist after 2nd tick');
      const brief = JSON.parse(rawBrief) as Record<string, unknown>;
      assert.ok(Array.isArray(brief['bullets']), 'brief.bullets must be an array');
      assert.ok(
        (brief['bullets'] as unknown[]).length >= 1,
        `brief.bullets must have ≥1 entry, got ${String((brief['bullets'] as unknown[]).length)}`,
      );

      // ── Assertion 6: ≥2 messages on brief:updated ─────────────────────────
      // Give a short grace period for in-flight publishes to arrive
      if (receivedMessages.length < 2) {
        await new Promise<void>((r) => setTimeout(r, 1_000));
      }
      assert.ok(
        receivedMessages.length >= 2,
        `Expected ≥2 messages on ${BRIEF_UPDATED_CHANNEL}, got ${receivedMessages.length}`,
      );
      // All messages must be the bare 'updated' string
      for (const msg of receivedMessages) {
        assert.equal(
          msg,
          'updated',
          `All messages on ${BRIEF_UPDATED_CHANNEL} must be 'updated', got: ${String(msg)}`,
        );
      }

    } finally {
      // ── Cross-platform shutdown ───────────────────────────────────────────
      try { proc.stdin.write('SHUTDOWN\n'); } catch { /* stdin may be closed */ }
      if (process.platform !== 'win32') {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      }

      await new Promise<void>((resolveExit) => {
        const exitTimer = setTimeout(() => {
          try {
            proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
          } catch { /* ignore */ }
          resolveExit();
        }, 8_000);

        proc.on('close', () => {
          clearTimeout(exitTimer);
          resolveExit();
        });
      });

      // Force-DEL lease as fallback (in case shutdown didn't release it cleanly)
      await client.del(LEASE_KEY).catch(() => undefined);

      await subscriber.quit().catch(() => undefined);
      await client.del(...TEST_KEYS).catch(() => undefined);
      await client.quit().catch(() => undefined);

      if (!proc.killed) {
        try {
          proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        } catch { /* ignore */ }
      }
    }
  },
);

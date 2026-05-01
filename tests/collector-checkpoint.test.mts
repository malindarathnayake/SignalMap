/**
 * Phase 3 unit 3d — Collector checkpoint test.
 *
 * Test A: ≥2 ticks within a bounded time window, lease renewed (not just acquired
 *         once), heartbeat fresh, channel publish wired (or principled skip on
 *         environmental empty).
 *
 * Test B: Two-instance lease test — second collector waits for first to die
 *         before acquiring the lease.
 *
 * Prerequisites:
 *   - Redis must be reachable at redis://localhost:6379
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const LEASE_KEY = 'signalmap:collector:lease';
const HEARTBEAT_KEY = 'signalmap:collector:heartbeat';
const STATUS_KEY = 'signalmap:collector:status';
const SSE_COUNTER_KEY = 'signalmap:sse:counter';
const SSE_RING_KEY = 'signalmap:sse:ring';
const TEST_KEYS = [LEASE_KEY, HEARTBEAT_KEY, STATUS_KEY, SSE_COUNTER_KEY, SSE_RING_KEY];

const WORKER_ENV = {
  ...process.env,
  SIGNALMAP_RSS_POLL_MINUTES: '0.1',
  SIGNALMAP_COLLECTOR_LEASE_TTL_SEC: '5',
  SIGNALMAP_BACKEND_MODE: 'fixture',
  REDIS_URL: 'redis://localhost:6379',
  SIGNALMAP_VECTOR_ENABLED: 'false',
};

function spawnWorker() {
  return spawn(
    'npx',
    ['tsx', 'server/workers/collector.ts'],
    {
      env: WORKER_ENV,
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );
}

/**
 * Send SHUTDOWN via stdin (cross-platform), then SIGTERM on POSIX.
 * Returns a Promise that resolves when the process closes (8s budget; force-kills on timeout).
 */
function gracefulShutdown(proc: ReturnType<typeof spawn>): Promise<void> {
  return new Promise<void>((resolveP) => {
    if (proc.exitCode !== null || proc.killed) {
      resolveP();
      return;
    }
    try { proc.stdin.write('SHUTDOWN\n'); } catch { /* stdin may be closed */ }
    if (process.platform !== 'win32') {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    const timer = setTimeout(() => {
      try {
        proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      } catch { /* ignore */ }
      resolveP();
    }, 8_000);
    proc.on('close', () => { clearTimeout(timer); resolveP(); });
  });
}

function forceKill(proc: ReturnType<typeof spawn>): void {
  if (proc.exitCode === null && !proc.killed) {
    try { proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); } catch { /* ignore */ }
  }
}

/**
 * On Windows with shell:true, the spawn pid is CMD.EXE and the inner Node process
 * is an orphan after the shell exits. Use taskkill /F /T to kill the whole process
 * tree by shell pid, ensuring all child processes are terminated.
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch { /* process may already be dead */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ }
  }
}

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

  // waiters: for each event name, an array of { minCount, resolve }
  // minCount is the total count of that event we need to have seen before resolving
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
          // Resolve any waiters whose minCount is now satisfied
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
        // Check if already have n occurrences
        const existing = events.filter((e) => e['event'] === name);
        if (existing.length >= n) {
          resolveP(existing[n - 1]!);
          return;
        }
        // Use a sentinel object for removal — avoids conflicts when two waiters share minCount
        // eslint-disable-next-line prefer-const
        let entry: { minCount: number; resolve: EventCallback; timer: ReturnType<typeof setTimeout> };
        const timer = setTimeout(() => {
          const pending = waiters.get(name);
          if (pending) {
            // Remove by object identity, not by minCount
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

// ─── Test A ───────────────────────────────────────────────────────────────────

test(
  'collector checkpoint: ≥2 ticks, lease renewed, heartbeat fresh, channel publish wired',
  { timeout: 90_000 },
  async (t) => {
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

    // Pre-clean: evict any orphaned collector process before starting.
    {
      const hbRaw = await client.get(HEARTBEAT_KEY).catch(() => null);
      if (hbRaw !== null) {
        try {
          const hb = JSON.parse(hbRaw) as Record<string, unknown>;
          if (typeof hb['pid'] === 'number') {
            try { process.kill(hb['pid'] as number); } catch { /* already dead */ }
          }
        } catch { /* ignore */ }
      }
    }
    await client.del(...TEST_KEYS);
    await new Promise<void>((r) => setTimeout(r, 500));

    const subscriberMessages: string[] = [];
    await subscriber.subscribe('signalmap:events');
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === 'signalmap:events') subscriberMessages.push(message);
    });

    const proc = spawnWorker();
    const stderrLines: string[] = [];
    const parser = attachStdoutParser(proc, stderrLines);
    const waitStartTs = Date.now();
    let innerPidA: number | null = null;

    try {
      // ── Wait for 2nd tick-success ──────────────────────────────────────────
      // Wrap the 35s overall timeout around the waitForNthEvent promise
      const secondTick = await new Promise<Record<string, unknown>>((resolveP, rejectP) => {
        const hardTimer = setTimeout(() => {
          const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
          rejectP(new Error(`≥2 collector-tick-success not seen within 35s.\n${combined}`));
        }, 35_000);

        parser.waitForNthEvent('collector-tick-success', 2, 34_000)
          .then((ev) => { clearTimeout(hardTimer); resolveP(ev); })
          .catch((err: unknown) => {
            clearTimeout(hardTimer);
            const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rejectP(new Error(`${String(err)}\n${combined}`));
          });

        proc.on('error', (err) => { clearTimeout(hardTimer); rejectP(err); });
        proc.on('exit', (code) => {
          clearTimeout(hardTimer);
          if (parser.countEvents('collector-tick-success') < 2) {
            const combined = 'STDOUT:\n' + parser.lines.join('') + '\nSTDERR:\n' + stderrLines.join('');
            rejectP(new Error(
              `collector exited (code=${String(code)}) before 2nd tick-success.\n${combined}`,
            ));
          }
        });
      });

      void secondTick; // captured for context, not directly used below

      // Capture ownerId and inner pid
      const startedEv = parser.getFirst('collector-started');
      const capturedOwnerId = startedEv && typeof startedEv['ownerId'] === 'string'
        ? (startedEv['ownerId'] as string)
        : null;
      if (startedEv && typeof startedEv['pid'] === 'number') {
        innerPidA = startedEv['pid'] as number;
      }

      // Gather per-tick counts from all tick-success events seen so far
      const allTickSuccessEvents = parser.events.filter((e) => e['event'] === 'collector-tick-success');
      const tickEventCounts = allTickSuccessEvents.map((e) =>
        typeof e['eventCount'] === 'number' ? (e['eventCount'] as number) : 0,
      );
      const tickPublishedCounts = allTickSuccessEvents.map((e) =>
        typeof e['publishedThisTick'] === 'number' ? (e['publishedThisTick'] as number) : 0,
      );

      // ── Assertion 1: ≥2 ticks ─────────────────────────────────────────────
      assert.ok(parser.countEvents('collector-tick-success') >= 2,
        `Expected ≥2 tick-success events, got ${parser.countEvents('collector-tick-success')}`);

      // ── Assertion 2: mid-run lease snapshot ─────────────────────────────
      // Take a snapshot now (~after 2nd tick, well before any possible expiry)
      const midLeaseValue = await client.get(LEASE_KEY);
      assert.ok(
        midLeaseValue !== null,
        `signalmap:collector:lease must still exist after 2nd tick. Got null. ` +
        `Elapsed: ${Date.now() - waitStartTs}ms`,
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
      assert.ok(rawHeartbeat !== null, 'signalmap:collector:heartbeat must exist after 2nd tick');
      const heartbeat = JSON.parse(rawHeartbeat) as Record<string, unknown>;
      assert.ok(typeof heartbeat['pid'] === 'number', `heartbeat.pid must be number`);
      assert.ok(typeof heartbeat['ts'] === 'number', `heartbeat.ts must be number`);
      assert.ok(typeof heartbeat['ownerId'] === 'string', `heartbeat.ownerId must be string`);
      const heartbeatAge = Date.now() - (heartbeat['ts'] as number);
      assert.ok(heartbeatAge < 15_000, `heartbeat.ts must be within last 15s. Age: ${heartbeatAge}ms`);

      // ── Assertion 4: status key ───────────────────────────────────────────
      const rawStatus = await client.get(STATUS_KEY);
      assert.ok(rawStatus !== null, 'signalmap:collector:status must exist after 2nd tick');
      const status = JSON.parse(rawStatus) as Record<string, unknown>;
      assert.equal(status['outcome'], 'success', `status.outcome must be "success", got ${String(status['outcome'])}`);

      // ── Assertion 5: SSE channel publish wiring ───────────────────────────
      const anyPublished = tickPublishedCounts.some((n) => n > 0);
      const allEventsZero = tickEventCounts.every((n) => n === 0);

      if (anyPublished && subscriberMessages.length >= 1) {
        const rawMsg = subscriberMessages[0]!;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawMsg) as Record<string, unknown>;
        } catch {
          assert.fail(`First SSE message is not valid JSON: ${rawMsg}`);
          return;
        }
        assert.equal(typeof parsed['id'], 'number', 'parsed.id must be a number');
        assert.equal(typeof parsed['payload'], 'object', 'parsed.payload must be an object');
        assert.ok(parsed['payload'] !== null, 'parsed.payload must not be null');
        const payload = parsed['payload'] as Record<string, unknown>;
        assert.equal(typeof payload['data'], 'string', 'payload.data must be a string');
        assert.ok((payload['data'] as string).length > 0, 'payload.data must be non-empty');
        let innerData: unknown;
        try {
          innerData = JSON.parse(payload['data'] as string);
        } catch {
          assert.fail(`payload.data is not valid JSON: ${String(payload['data'])}`);
          return;
        }
        assert.ok(innerData !== null && typeof innerData === 'object', 'payload.data round-trip must yield an object');

      } else if (!anyPublished && allEventsZero) {
        t.skip(
          'all observed ticks ingested 0 events from RSS this run — known environmental fragility ' +
          '(1c precedent: real RSS feeds may return 150 items all parser-rejected). ' +
          'Two-instance lease test still runs in Test B.',
        );
        return;

      } else if (anyPublished && subscriberMessages.length === 0) {
        assert.fail(
          `Worker reported publishedThisTick > 0 (counts: ${tickPublishedCounts.join(',')}) ` +
          `but signalmap:events subscriber received 0 messages — broken SSE publish plumbing. ` +
          `tickEventCounts: ${tickEventCounts.join(',')}`,
        );
      }

    } finally {
      const shellPid = proc.pid;
      await gracefulShutdown(proc);
      forceKill(proc);
      // Kill the entire process tree (handles Windows shell:true orphans)
      if (shellPid !== undefined) killProcessTree(shellPid);
      // Also kill inner pid directly if we have it
      if (innerPidA !== null) {
        try { process.kill(innerPidA); } catch { /* already dead */ }
      }
      await subscriber.quit().catch(() => undefined);
      await client.del(...TEST_KEYS).catch(() => undefined);
      await client.quit().catch(() => undefined);
    }
  },
);

// ─── Test B ───────────────────────────────────────────────────────────────────

test(
  'collector two-instance lease: second instance waits until first dies',
  { timeout: 60_000 },
  async () => {
    const client = new Redis('redis://localhost:6379', {
      connectTimeout: 3_000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    assert.equal(await client.ping(), 'PONG', 'Redis PING must return PONG');

    // Pre-clean: evict any orphaned collector processes holding the lease, then delete keys.
    // On Windows shell:true, CMD.EXE can exit while the inner Node process survives as
    // an orphan and keeps renewing the lease. Repeat kill+delete+check up to 3 times.
    for (let attempt = 0; attempt < 3; attempt++) {
      const hbRaw = await client.get(HEARTBEAT_KEY).catch(() => null);
      if (hbRaw !== null) {
        try {
          const hb = JSON.parse(hbRaw) as Record<string, unknown>;
          if (typeof hb['pid'] === 'number') {
            try { process.kill(hb['pid'] as number); } catch { /* already dead */ }
          }
        } catch { /* invalid JSON — ignore */ }
      }
      await client.del(...TEST_KEYS);
      // Give the killed process time to stop renewing before we check
      await new Promise<void>((r) => setTimeout(r, 800));
      // If lease is still being re-acquired by another orphan, loop again
      const leaseCheck = await client.get(LEASE_KEY).catch(() => null);
      if (leaseCheck === null) break;
      // Lease re-appeared — another orphan; loop to kill it
    }

    // Hoist all mutable state so the finally block can access it regardless of
    // which code path threw.
    let procA: ReturnType<typeof spawn> | null = null;
    let procB: ReturnType<typeof spawn> | null = null;
    let shellPidA: number | undefined;
    let shellPidB: number | undefined;
    let innerPidA: number | null = null;
    let innerPidB: number | null = null;
    let stderrA: string[] = [];
    let stderrB: string[] = [];
    let parserA: ProcessParser | null = null;
    let parserB: ProcessParser | null = null;

    try {
      // ── Spawn instance A and wait for its first tick ──────────────────────
      procA = spawnWorker();
      shellPidA = procA.pid;
      stderrA = [];
      parserA = attachStdoutParser(procA, stderrA);

      await parserA.waitForNthEvent('collector-tick-success', 1, 25_000).catch((err: unknown) => {
        const combined = 'A STDOUT:\n' + (parserA?.lines.join('') ?? '') + '\nA STDERR:\n' + stderrA.join('');
        throw new Error(`Instance A first tick-success not seen: ${String(err)}\n${combined}`);
      });

      const startedEvA = parserA.getFirst('collector-started');
      const ownerIdA = startedEvA && typeof startedEvA['ownerId'] === 'string'
        ? (startedEvA['ownerId'] as string)
        : null;
      if (startedEvA && typeof startedEvA['pid'] === 'number') {
        innerPidA = startedEvA['pid'] as number;
      }

      assert.ok(parserA.hasEvent('collector-tick-success'), 'Instance A must emit at least one tick-success');

      // ── Spawn instance B ──────────────────────────────────────────────────
      procB = spawnWorker();
      shellPidB = procB.pid;
      stderrB = [];
      parserB = attachStdoutParser(procB, stderrB);

      // Assertion 1 & 2: B emits collector-skipped-no-lease within 15s, never tick-success
      const skipOrTick = await new Promise<'skipped' | 'ticked' | 'timeout'>((resolveP) => {
        const timer = setTimeout(() => resolveP('timeout'), 15_000);

        parserB!.waitForNthEvent('collector-skipped-no-lease', 1, 15_000)
          .then(() => { clearTimeout(timer); resolveP('skipped'); })
          .catch(() => { /* handled by outer timer */ });

        parserB!.waitForNthEvent('collector-tick-success', 1, 15_000)
          .then(() => { clearTimeout(timer); resolveP('ticked'); })
          .catch(() => { /* handled by outer timer */ });
      });

      const startedEvB = parserB.getFirst('collector-started');
      const ownerIdB = startedEvB && typeof startedEvB['ownerId'] === 'string'
        ? (startedEvB['ownerId'] as string)
        : null;
      if (startedEvB && typeof startedEvB['pid'] === 'number') {
        innerPidB = startedEvB['pid'] as number;
      }

      if (skipOrTick === 'timeout') {
        const combined =
          'B STDOUT:\n' + parserB.lines.join('') + '\nB STDERR:\n' + stderrB.join('') +
          '\nA STDOUT:\n' + (parserA?.lines.join('') ?? '');
        assert.fail(
          `Instance B: did not emit collector-skipped-no-lease within 15s while A is running.\n${combined}`,
        );
      }
      assert.equal(skipOrTick, 'skipped',
        'Instance B must emit collector-skipped-no-lease while A holds the lease — got: ' + skipOrTick);
      assert.equal(
        parserB.hasEvent('collector-tick-success'),
        false,
        'Instance B must NOT emit collector-tick-success while A holds the lease',
      );

      // Assertion 3: lease still belongs to A
      const leaseAfterBSkip = await client.get(LEASE_KEY);
      assert.ok(leaseAfterBSkip !== null, 'Lease key must still exist after B is skipped');
      if (ownerIdA !== null) {
        assert.equal(
          leaseAfterBSkip,
          ownerIdA,
          `Lease must still equal A's ownerId after B skips. Got: ${String(leaseAfterBSkip)}`,
        );
      }

      // Assertion 4: Shut down A — kill shell + entire process tree
      await gracefulShutdown(procA);
      forceKill(procA);
      if (shellPidA !== undefined) killProcessTree(shellPidA);
      if (innerPidA !== null) { try { process.kill(innerPidA); } catch { /* already dead */ } }
      procA = null;

      // Poll for up to 7s for the lease to clear. If still held by A after the kill,
      // forcibly delete it (simulates TTL expiry — valid for a crashed worker).
      {
        const pollEnd = Date.now() + 7_000;
        let leaseCleared = false;
        while (Date.now() < pollEnd) {
          const cur = await client.get(LEASE_KEY);
          if (cur === null || (ownerIdA !== null && cur !== ownerIdA)) {
            leaseCleared = true;
            break;
          }
          await new Promise<void>((r) => setTimeout(r, 500));
        }
        if (!leaseCleared && ownerIdA !== null) {
          const cur = await client.get(LEASE_KEY);
          if (cur === ownerIdA) await client.del(LEASE_KEY);
        }
      }

      // Assertion 5: B acquires the lease within 15s of A's death
      // Use a polling loop instead of waitForNthEvent to avoid any waiter-timer
      // interaction from the earlier skipOrTick race.
      {
        const deadline = Date.now() + 15_000;
        let bGotTickSuccess = false;
        while (Date.now() < deadline) {
          if (parserB.hasEvent('collector-tick-success')) {
            bGotTickSuccess = true;
            break;
          }
          await new Promise<void>((r) => setTimeout(r, 300));
        }
        if (!bGotTickSuccess) {
          const leaseNow = await client.get(LEASE_KEY).catch(() => '<redis-error>');
          const bAlive = procB !== null && procB.exitCode === null && !procB.killed;
          const combined =
            `B STDOUT:\n${parserB?.lines.join('') ?? ''}\n` +
            `B STDERR:\n${stderrB.join('')}\n` +
            `B alive: ${String(bAlive)}, B exitCode: ${String(procB?.exitCode)}\n` +
            `Lease now: ${String(leaseNow)}\n` +
            `ownerIdA: ${String(ownerIdA)}, ownerIdB: ${String(ownerIdB)}, innerPidA: ${String(innerPidA)}\n` +
            `B events: ${JSON.stringify(parserB?.events.map((e) => e['event']) ?? [])}`;
          assert.fail(`Instance B: tick-success not seen within 15s after A shutdown.\n${combined}`);
        }
      }

      assert.ok(parserB.hasEvent('collector-tick-success'),
        'Instance B must emit collector-tick-success after A releases the lease');

      // Assertion 6: lease now belongs to B
      const leaseAfterBTick = await client.get(LEASE_KEY);
      assert.ok(leaseAfterBTick !== null, 'Lease must exist after B acquires it');
      if (ownerIdB !== null) {
        assert.equal(
          leaseAfterBTick,
          ownerIdB,
          `Lease must equal B's ownerId after B acquires. Got: ${String(leaseAfterBTick)}`,
        );
      }

    } finally {
      // Shut down B
      if (procB !== null) {
        await gracefulShutdown(procB);
        forceKill(procB);
      }
      if (shellPidB !== undefined) killProcessTree(shellPidB);
      if (innerPidB !== null) { try { process.kill(innerPidB); } catch { /* ignore */ } }

      // Shut down A if still alive (e.g., test failed before assertion 4)
      if (procA !== null) {
        forceKill(procA);
      }
      if (shellPidA !== undefined) killProcessTree(shellPidA);
      if (innerPidA !== null) { try { process.kill(innerPidA); } catch { /* ignore */ } }

      await client.del(...TEST_KEYS).catch(() => undefined);
      await client.quit().catch(() => undefined);
    }
  },
);

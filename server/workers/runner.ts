/**
 * Generic worker shell shared between server/workers/collector.ts and
 * server/workers/cron.ts. Owns lease acquisition + renewal at TTL/2,
 * unconditional heartbeat refresh, status writes (outcome=success/fail),
 * inter-tick sleep, and graceful shutdown via SIGTERM/SIGINT/stdin SHUTDOWN.
 *
 * The tick callback supplied by the caller is the only worker-specific code.
 */

import { randomUUID } from 'node:crypto';
import { createRedisAdapter, type ManagedRedisAdapter } from '../../src/server/lib/redis.ts';
import { acquireLease, renewLease, releaseLease } from './lease.ts';
import { createLogger } from '../_shared/logger.ts';

const LEASE_CONTENTION_RETRY_MS = 5000;
// On cold start (or after `docker compose down -v`) we want the workers to
// recover quickly from a transient first-tick failure instead of waiting a
// full pollIntervalMs (15 min collector / 30 min cron) before retrying. Once
// any tick has succeeded, we switch to the configured pollIntervalMs.
const COLD_START_RETRY_MS = 60_000;

// ─── Cancellable sleep ────────────────────────────────────────────────────────

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WorkerConfig {
  /** Service name used as a prefix for all log events: `${name}-started`, `${name}-tick-start`, etc. */
  serviceName: string;
  /** Redis key for the singleton lease. */
  leaseKey: string;
  /** Redis key for the worker heartbeat. */
  heartbeatKey: string;
  /** Redis key for the worker last-tick status. */
  statusKey: string;
  /** Lease TTL in seconds. Renewal fires at TTL/2. */
  leaseTtlSec: number;
  /** Inter-tick sleep duration in milliseconds. */
  pollIntervalMs: number;
  /**
   * Tick callback. Runs once per acquisition under the lease.
   * - `redis` is the lease-held adapter; the callback may use it for any tick-scoped Redis work
   *   (the runner already wrote heartbeat + will write status afterward).
   * - `signal` is a per-acquisition AbortSignal that fires on either lostLease OR process shutdown.
   *
   * Returning a normal object is treated as success. The runner writes status outcome=success and
   * spreads the returned object into the tick-success log line. Any `eventCount` field on the
   * returned object is also written to status under the same key.
   *
   * Returning void/undefined is treated as success with eventCount=0.
   *
   * Throwing is treated as failure. The runner writes status outcome=fail with the error message
   * and emits a tick-fail log line.
   */
  tick: (redis: ManagedRedisAdapter, signal: AbortSignal) => Promise<Record<string, unknown> | void>;
  /**
   * Optional metric hook called after each tick attempt with the outcome.
   * The runner does not import emitMetric directly — the calling worker passes
   * a closure that emits its service-specific tick counter.
   */
  onTickOutcome?: (outcome: 'success' | 'fail' | 'skipped_no_lease') => void;
}

/**
 * Runs the worker shell:
 *   1. Generate ownerId (UUID).
 *   2. Connect Redis.
 *   3. Install SIGTERM/SIGINT/stdin SHUTDOWN handlers.
 *   4. Loop: acquireLease → start renewal timer → unconditional heartbeat → tick → status → sleep.
 *   5. On shutdown: releaseLease (best-effort) and redis.quit().
 *
 * Returns when shutdown completes or an unrecoverable error occurs.
 */
export async function runWorker(config: WorkerConfig): Promise<void> {
  const ownerId = randomUUID();
  const redis = createRedisAdapter();
  const log = createLogger(config.serviceName);

  // heartbeat TTL = 2× poll interval (clamped to a minimum so it never expires faster than the lease)
  const heartbeatTtlSec = Math.max(config.leaseTtlSec * 2, Math.ceil(config.pollIntervalMs * 2 / 1000));

  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  let aborted = false;

  function shutdown(signal: string): void {
    if (aborted) return;
    aborted = true;
    log.info(`${config.serviceName}-shutdown`, { signal });
    abortController.abort();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Stdin fallback for Windows tests — child.kill('SIGTERM') is forceful on Windows
  // and does not deliver the signal to the JS handler. The test writes "SHUTDOWN\n"
  // to stdin as a cross-platform graceful-exit trigger.
  let stdinBuffer = '';
  process.stdin.on('data', (chunk: Buffer) => {
    stdinBuffer += chunk.toString('utf8');
    if (stdinBuffer.includes('SHUTDOWN')) {
      shutdown('stdin');
    }
  });
  process.stdin.on('end', () => {
    /* no-op */
  });

  log.info(`${config.serviceName}-started`, { ownerId, pid: process.pid });

  // Cold-start retry: until a tick succeeds, fall back to a short retry
  // window so a transient first-tick failure doesn't blank the UI for a
  // full pollIntervalMs.
  let hadSuccessfulTick = false;

  try {
    while (!aborted) {
      // ── Acquire lease ──────────────────────────────────────────────────────
      const acquired = await acquireLease(redis, config.leaseKey, config.leaseTtlSec, ownerId);

      if (!acquired) {
        log.info(`${config.serviceName}-skipped-no-lease`);
        config.onTickOutcome?.('skipped_no_lease');
        await sleep(LEASE_CONTENTION_RETRY_MS, abortSignal);
        continue;
      }

      // ── Lease acquired: start renewal timer (spans tick + inter-tick sleep) ─
      // F1 fix: timer must keep renewing during the inter-tick sleep, otherwise
      // the lease expires LEASE_TTL_SEC after each tick and another instance
      // can acquire — split-brain. Timer is created once per acquisition and
      // cleared in the outer finally OR inside the callback on lostLease.
      let lostLease = false;
      const leaseAbortController = new AbortController();
      // leaseAbortSignal is passed to the inter-tick sleep so lostLease wakes it immediately.
      // Also forward the process-level abortSignal so shutdown always wakes the sleep.
      const leaseAbortSignal = leaseAbortController.signal;
      const onProcessAbort = () => leaseAbortController.abort();
      abortSignal.addEventListener('abort', onProcessAbort, { once: true });
      let renewTimer: ReturnType<typeof setInterval> | null = null;
      renewTimer = setInterval(async () => {
        if (lostLease || aborted) {
          if (renewTimer !== null) {
            clearInterval(renewTimer);
            renewTimer = null;
          }
          return;
        }
        const renewed = await renewLease(redis, config.leaseKey, config.leaseTtlSec, ownerId).catch(() => false);
        if (!renewed && !lostLease && !aborted) {
          lostLease = true;
          log.info(`${config.serviceName}-lease-lost`, { ownerId });
          leaseAbortController.abort();
          if (renewTimer !== null) {
            clearInterval(renewTimer);
            renewTimer = null;
          }
        }
      }, (config.leaseTtlSec * 1000) / 2);

      try {
        // ── Tick body ────────────────────────────────────────────────────────
        log.info(`${config.serviceName}-tick-start`);

        // F2 fix: refresh heartbeat unconditionally at the start of every tick
        // attempt, BEFORE the success/fail branch. After persistent failures the
        // health route reads outcome=fail + fresh heartbeat → 'degraded'
        // (per spec probeWorker semantics) instead of 'down'.
        await redis
          .setJsonEx(config.heartbeatKey, { pid: process.pid, ts: Date.now(), ownerId }, heartbeatTtlSec)
          .catch(() => undefined);

        let tickResult: Record<string, unknown> | void;
        try {
          tickResult = await config.tick(redis, leaseAbortSignal);
        } catch (tickErr) {
          const msg = tickErr instanceof Error ? tickErr.message : String(tickErr);
          await redis
            .setJsonEx(config.statusKey, { outcome: 'fail', errorMessage: msg, ts: Date.now() }, heartbeatTtlSec)
            .catch(() => undefined);
          log.error(`${config.serviceName}-tick-fail`, { error: msg });
          config.onTickOutcome?.('fail');
          tickResult = undefined;
        }

        if (tickResult !== undefined) {
          const eventCount: number = typeof tickResult['eventCount'] === 'number'
            ? (tickResult['eventCount'] as number)
            : 0;

          await redis
            .setJsonEx(config.statusKey, { outcome: 'success', eventCount, ts: Date.now() }, heartbeatTtlSec)
            .catch(() => undefined);

          log.info(`${config.serviceName}-tick-success`, tickResult);
          config.onTickOutcome?.('success');
          hadSuccessfulTick = true;
        }

        // ── Inter-tick sleep (skip if lost lease or aborted) ──────────────────
        // F1 fix: this sleep is now INSIDE the try block so the renewTimer in
        // the outer finally below covers the entire lease-held lifetime.
        // leaseAbortSignal is aborted by the renewal callback on lostLease so
        // the sleep returns immediately instead of blocking for POLL_INTERVAL_MS.
        // Cold-start fast retry: shorten the sleep until the first successful
        // tick lands (clamped to pollIntervalMs so a config with a tiny poll
        // can never sleep longer than configured).
        if (!aborted && !lostLease) {
          const sleepMs = hadSuccessfulTick
            ? config.pollIntervalMs
            : Math.min(config.pollIntervalMs, COLD_START_RETRY_MS);
          await sleep(sleepMs, leaseAbortSignal);
        }
        // If lostLease: skip sleep → immediately retry acquire on next iteration
      } finally {
        // F1 fix: clear renewal timer at the end of the lease-held block
        // (covers both tick body and inter-tick sleep).
        if (renewTimer !== null) {
          clearInterval(renewTimer);
          renewTimer = null;
        }
        abortSignal.removeEventListener('abort', onProcessAbort);
      }
    }

    // Loop drained cleanly — best-effort lease release
    try {
      await releaseLease(redis, config.leaseKey, ownerId);
    } catch {
      // best-effort; ignore failures
    }
  } finally {
    await redis.quit();
  }
}

/**
 * SignalMap collector worker.
 *
 * Wraps scripts/signalmap-news-collector.mjs as a singleton-leased tick loop
 * via the shared runWorker shell in server/workers/runner.ts.
 */

// @ts-expect-error - production collector remains the ESM script used by tests and Docker.
import { collectSignalMapNews } from '../../scripts/signalmap-news-collector.mjs';
import { publishStreamEvent } from '../../src/server/lib/sse-replay-ring.ts';
import type { RedisAdapter } from '../../src/server/lib/redis.types.ts';
import { runWorker } from './runner.ts';
import { createLogger } from '../_shared/logger.ts';
import { emitMetric, METRICS } from '../../src/server/lib/metrics.js';
import {
  collectSignalMapCloudflareRadar,
  writeSignalMapCloudflareRadar,
} from './cloudflare-radar-source.ts';
import {
  collectSignalMapProviderStatuses,
  writeSignalMapProviderStatuses,
} from './provider-status-sources.ts';

const log = createLogger('collector');

// ─── Constants & env vars ─────────────────────────────────────────────────────

const LEASE_KEY = 'signalmap:collector:lease';
const HEARTBEAT_KEY = 'signalmap:collector:heartbeat';
const STATUS_KEY = 'signalmap:collector:status';

const LEASE_TTL_SEC = Number(process.env['SIGNALMAP_COLLECTOR_LEASE_TTL_SEC'] ?? 60);
const POLL_MINUTES = Number(process.env['SIGNALMAP_RSS_POLL_MINUTES'] ?? 15);
const POLL_INTERVAL_MS = Math.max(1, POLL_MINUTES * 60_000);

// ─── Per-process SSE dedup set ────────────────────────────────────────────────

const publishedIds = new Set<string>();

type TickOutcome = {
  events: Array<Record<string, unknown>>;
  meta: {
    recordCount: number;
  };
  sourceFailures: string[];
};

function eventRecords(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  const events = (value as Record<string, unknown>)['events'];
  return Array.isArray(events)
    ? events.filter((event): event is Record<string, unknown> =>
        event !== null && typeof event === 'object' && !Array.isArray(event),
      )
    : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Tick runner (with env-gated test seam) ───────────────────────────────────

/**
 * Wraps the production collector entrypoint. The env-gated test seam below is
 * used by tests/collector-fail-path.test.mts to force a throw and exercise the
 * fail-status code path. Production deployments must NOT set this env var.
 */
async function runCollectorTick(redis: Pick<RedisAdapter, 'setJsonEx'>): Promise<TickOutcome> {
  if (process.env['SIGNALMAP_COLLECTOR_TEST_FAIL_TICK'] === '1') {
    throw new Error('TEST_FAIL_INJECTION: forced collector tick failure');
  }

  const radarTask = collectSignalMapCloudflareRadar({})
    .then(async (result) => {
      await writeSignalMapCloudflareRadar(redis, result);
      return result;
    });
  const providerTask = collectSignalMapProviderStatuses({})
    .then(async (result) => {
      await writeSignalMapProviderStatuses(redis, result);
      return result;
    });

  const [newsOutcome, radarOutcome, providerOutcome] = await Promise.allSettled([
    collectSignalMapNews({}),
    radarTask,
    providerTask,
  ]);

  const events: Array<Record<string, unknown>> = [];
  const sourceFailures: string[] = [];

  if (newsOutcome.status === 'fulfilled') {
    events.push(...eventRecords(newsOutcome.value));
  } else {
    const message = errorMessage(newsOutcome.reason);
    sourceFailures.push(`news: ${message}`);
    log.error('collector-source-fail', { source: 'news', error: message });
  }

  if (radarOutcome.status === 'fulfilled') {
    events.push(...eventRecords(radarOutcome.value));
  } else {
    const message = errorMessage(radarOutcome.reason);
    sourceFailures.push(`cloudflare-radar: ${message}`);
    log.error('collector-source-fail', { source: 'cloudflare-radar', error: message });
  }

  if (providerOutcome.status === 'fulfilled') {
    events.push(...eventRecords(providerOutcome.value));
  } else {
    const message = errorMessage(providerOutcome.reason);
    sourceFailures.push(`provider-status: ${message}`);
    log.error('collector-source-fail', { source: 'provider-status', error: message });
  }

  if (sourceFailures.length === 3) {
    throw new Error(`All collector sources failed: ${sourceFailures.join('; ')}`);
  }

  return {
    events,
    meta: {
      recordCount: events.length,
    },
    sourceFailures,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

runWorker({
  serviceName: 'collector',
  leaseKey: LEASE_KEY,
  heartbeatKey: HEARTBEAT_KEY,
  statusKey: STATUS_KEY,
  leaseTtlSec: LEASE_TTL_SEC,
  pollIntervalMs: POLL_INTERVAL_MS,
  onTickOutcome: (outcome) => emitMetric(METRICS.COLLECTOR_TICK, 1, { outcome }),
  tick: async (redis, _leaseAbortSignal) => {
    const tickResult = await runCollectorTick(redis);

    const r = tickResult as Record<string, unknown>;
    const eventsArr = Array.isArray(r['events']) ? (r['events'] as unknown[]) : null;
    const meta = typeof r['meta'] === 'object' && r['meta'] !== null
      ? (r['meta'] as Record<string, unknown>)
      : null;
    const eventCount: number = eventsArr !== null
      ? eventsArr.length
      : typeof meta?.['recordCount'] === 'number'
      ? (meta['recordCount'] as number)
      : 0;

    const eventsArrTyped = Array.isArray((tickResult as Record<string, unknown>)['events'])
      ? ((tickResult as Record<string, unknown>)['events'] as Array<Record<string, unknown>>)
      : [];
    let publishedThisTick = 0;
    for (const ev of eventsArrTyped) {
      const evId = typeof ev['id'] === 'string' ? ev['id'] : null;
      if (evId === null) continue;
      if (publishedIds.has(evId)) {
        emitMetric(METRICS.COLLECTOR_EVENTS_DROPPED, 1, { reason: 'dedup' });
        continue;
      }
      try {
        await publishStreamEvent(redis, {
          event: 'signalmap.event.ingested',
          data: JSON.stringify(ev),
        });
        if (publishedIds.size >= 10_000) publishedIds.clear();
        publishedIds.add(evId);
        publishedThisTick += 1;
      } catch (publishErr) {
        const msg = publishErr instanceof Error ? publishErr.message : String(publishErr);
        log.error('collector-publish-fail', { error: msg, eventId: evId });
      }
    }

    emitMetric(METRICS.COLLECTOR_EVENTS_INGESTED, publishedThisTick, {});
    return { eventCount, publishedThisTick };
  },
})
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('collector-fatal', { error: err instanceof Error ? err : String(err) });
    process.exit(1);
  });

/**
 * SignalMap brief cron worker.
 *
 * Wraps scripts/brief-cron.mjs's runOnce() as a singleton-leased tick loop via
 * the shared runWorker shell in server/workers/runner.ts. Runs on a configurable
 * interval (default 30 minutes), writes signalmap:brief:global, and publishes
 * signalmap:brief:updated for SSE broadcast.
 *
 * runOnce() handles the brief-write + channel-publish itself (see brief-cron.mjs:145-146).
 * This worker only owns lifecycle: lease, heartbeat, retries, shutdown.
 */

// @ts-expect-error - brief cron remains the ESM script used by tests and Docker.
import { runOnce } from '../../scripts/brief-cron.mjs';
import { runWorker } from './runner';
import { createLogger } from '../_shared/logger';
import { getRedisAdapter } from '../../src/server/lib/redis';
import type { RedisAdapter } from '../../src/server/lib/redis.types';

const log = createLogger('cron');

// ─── Local-signal summary loader ─────────────────────────────────────────────
// The brief asks Perplexity for a global news summary and weaves in local
// SignalMap signals (collector + radar + provider events) so the brief reflects
// what the operator is actually monitoring. Without this the brief is purely
// upstream news and ignores live infra/security state.

const SOURCE_BLOB_KEYS = [
  'signalmap:news:v1',
  'signalmap:radar:v1',
  'signalmap:providers:v1',
] as const;
const LOCAL_SIGNAL_LIMIT = 12;

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function eventObservedMs(event: Record<string, unknown>): number {
  const candidates = [event['lastObservedAt'], event['startedAt'], event['publishedAt']];
  for (const v of candidates) {
    const parsed = Date.parse(String(v ?? ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildLocalSignalSummary(events: Array<Record<string, unknown>>): string {
  if (events.length === 0) return '(no live signals available)';
  const rows = events
    .sort((a, b) => eventObservedMs(b) - eventObservedMs(a))
    .slice(0, LOCAL_SIGNAL_LIMIT)
    .map((ev, idx) => {
      const title = cleanString(ev['title']) ?? cleanString(ev['canonicalTitle']) ?? String(ev['id'] ?? 'Untitled');
      const summary = cleanString(ev['summary']);
      const category = cleanString(ev['category']) ?? 'unknown';
      const severity = cleanString(ev['severity']) ?? 'unknown';
      const provider = cleanString(ev['provider']);
      const locArr = Array.isArray(ev['locations']) ? ev['locations'] : [];
      const location = locArr
        .map((l) => cleanString((l as Record<string, unknown>)?.['name']))
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const parts = [
        `${idx + 1}. [${category}/${severity}] ${title}`,
        summary ? `Summary: ${summary}` : undefined,
        provider ? `Provider: ${provider}` : undefined,
        location ? `Location: ${location}` : undefined,
      ].filter(Boolean);
      return parts.join(' | ');
    });
  return rows.join('\n');
}

async function loadLocalSignalSummary(redis: RedisAdapter): Promise<string> {
  const events: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const key of SOURCE_BLOB_KEYS) {
    try {
      const payload = await redis.getJson<{ events?: unknown[] }>(key);
      if (!payload || !Array.isArray(payload.events)) continue;
      for (const raw of payload.events) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const ev = raw as Record<string, unknown>;
        const id = typeof ev['id'] === 'string' ? ev['id'] : null;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        events.push(ev);
      }
    } catch (err) {
      log.warn('cron-local-signal-read-fail', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return buildLocalSignalSummary(events);
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

// ─── Constants & env vars ─────────────────────────────────────────────────────

const LEASE_KEY = 'signalmap:brief:cron:lease';
const HEARTBEAT_KEY = 'signalmap:brief:cron:heartbeat';
const STATUS_KEY = 'signalmap:brief:cron:status';

const LEASE_TTL_SEC = positiveIntegerFromEnv('SIGNALMAP_CRON_LEASE_TTL_SEC', 60);
const POLL_INTERVAL_MS = Math.max(1, positiveIntegerFromEnv('SIGNALMAP_BRIEF_REFRESH_MINUTES', 30) * 60_000);

// ─── Tick callback ────────────────────────────────────────────────────────────

async function runCronTick(signal: AbortSignal): Promise<{ briefWritten: 1 }> {
  if (process.env['SIGNALMAP_CRON_TEST_FIXTURE'] === '1') {
    await runOnce({
      signal,
      signalSummary: '1. [cyber/high] Fixture signal | Summary: Test signal for JSONL validation.',
      allowlist: ['reuters.com'],
      perplexityResp: {
        id: 'test-pplx-001',
        model: 'sonar-pro',
        created: Math.floor(Date.now() / 1000),
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Fixture global signal context from Reuters.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        citations: ['https://reuters.com/article/x'],
        search_results: [{ url: 'https://reuters.com/article/x' }],
      },
      openrouterOpts: {
        fetchImpl: async () => {
          const body = {
            id: 'or-test-001',
            model: 'anthropic/claude-sonnet-4.6',
            created: Math.floor(Date.now() / 1000),
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    bullets: ['Fixture signal brief generated for JSONL validation.'],
                    sources: [{ label: 'Reuters', url: 'https://reuters.com/article/x' }],
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
          };
          return {
            ok: true,
            json: async () => body,
            text: async () => JSON.stringify(body),
          };
        },
      },
    });
    return { briefWritten: 1 };
  }

  // Load local SignalMap signals so the brief reflects collector + radar
  // + provider state, not just upstream news. tolerate read failures —
  // the cron must still run if Redis is degraded.
  let signalSummary = '(no live signals available)';
  try {
    const redis = getRedisAdapter();
    signalSummary = await loadLocalSignalSummary(redis);
  } catch (err) {
    log.warn('cron-local-signals-unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await runOnce({ signal, signalSummary });
  return { briefWritten: 1 };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

runWorker({
  serviceName: 'cron',
  leaseKey: LEASE_KEY,
  heartbeatKey: HEARTBEAT_KEY,
  statusKey: STATUS_KEY,
  leaseTtlSec: LEASE_TTL_SEC,
  pollIntervalMs: POLL_INTERVAL_MS,
  tick: async (_redis, leaseAbortSignal) => {
    await runCronTick(leaseAbortSignal);
    return { eventCount: 1 };
  },
})
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('cron-fatal', { error: err instanceof Error ? err : String(err) });
    process.exit(1);
  });

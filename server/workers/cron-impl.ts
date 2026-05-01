/**
 * Brief cron — runs every SIGNALMAP_BRIEF_REFRESH_MINUTES (default 30) minutes.
 * Sole writer of signalmap:brief:global. Also publishes signalmap:brief:updated
 * for SSE broadcast on each successful write.
 */

import { getRedisAdapter } from '../../src/server/lib/redis';
import { callPerplexity, PerplexityResponse } from '../../src/server/lib/perplexity';
import { runBriefPipeline, BriefResult } from '../../src/server/lib/brief-pipeline';
import { reserveSpend, refundDifference } from '../../src/server/lib/spend-reservation';
import { emitMetric, METRICS } from '../../src/server/lib/metrics';
import { RedisAdapter } from 'src/server/lib/redis.types';

import { createLogger } from '../_shared/logger';

const log = createLogger('cron');

export const BRIEF_GLOBAL_KEY = 'signalmap:brief:global';
export const BRIEF_UPDATED_CHANNEL = 'signalmap:brief:updated';
export const DEFAULT_SIGNALMAP_BRIEF_LOCAL_SIGNAL_LIMIT = 12;

export const DEFAULT_DOMAIN_ALLOWLIST = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'theguardian.com',
  'ft.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'axios.com',
  'aljazeera.com',
];

function cleanString(value: any): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function eventObservedMs(event: any): number {
  for (const value of [event?.lastObservedAt, event?.startedAt, event?.publishedAt]) {
    const parsed = Date.parse(String(value ?? ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sourceSummary(sources: any[]): string {
  if (!Array.isArray(sources)) return '';
  return sources
    .map((source) => {
      const label =
        cleanString(source?.label) ?? cleanString(source?.name) ?? cleanString(source?.id);
      const url = cleanString(source?.url);
      if (!label && !url) return undefined;
      return url ? `${label ?? 'source'} ${url}` : label;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join('; ');
}

export function buildLocalSignalSummary(
  events: any[],
  limit = DEFAULT_SIGNALMAP_BRIEF_LOCAL_SIGNAL_LIMIT,
): string {
  if (!Array.isArray(events) || events.length === 0) return '(no live signals available)';

  const rows = events
    .filter((event) => event && typeof event === 'object')
    .sort((left, right) => eventObservedMs(right) - eventObservedMs(left))
    .slice(0, limit)
    .map((event, index) => {
      const title =
        cleanString(event.title) ??
        cleanString(event.canonicalTitle) ??
        event.id ??
        'Untitled signal';
      const summary = cleanString(event.summary);
      const category = cleanString(event.category) ?? 'unknown';
      const severity = cleanString(event.severity) ?? 'unknown';
      const provider = cleanString(event.provider);
      const location = Array.isArray(event.locations)
        ? event.locations
            .map((loc) => cleanString(loc?.name))
            .filter(Boolean)
            .slice(0, 2)
            .join(', ')
        : '';
      const sources = sourceSummary(event.sources);
      const parts = [
        `${index + 1}. [${category}/${severity}] ${title}`,
        summary ? `Summary: ${summary}` : undefined,
        provider ? `Provider: ${provider}` : undefined,
        location ? `Location: ${location}` : undefined,
        sources ? `Sources: ${sources}` : undefined,
      ].filter(Boolean);
      return parts.join(' | ');
    });

  return rows.length > 0 ? rows.join('
') : '(no live signals available)';
}

// Source-blob keys written by the collector. Read these alongside the
// per-event index so the brief sees current local signals even when the
// per-event ingestion path isn't populating the index set.
const SOURCE_BLOB_KEYS = [
  'signalmap:news:v1',
  'signalmap:radar:v1',
  'signalmap:providers:v1',
] as const;

async function loadLocalSignalSummary(redis: RedisAdapter): Promise<string> {
  const events: any[] = [];
  const seenIds = new Set<string>();

  // Read 1 — per-event keys (newer ingestion path; usually empty in current stack)
  try {
    const eventIds = await redis.smembers('signalmap:events:index');
    if (eventIds.length > 0) {
      const results = await redis.pipeline(eventIds.map((id) => ['get', `signalmap:event:${id}`]));
      for (const result of results) {
        if (result !== null && typeof result === 'string') {
          try {
            const ev = JSON.parse(result);
            if (typeof ev?.id === 'string' && !seenIds.has(ev.id)) {
              seenIds.add(ev.id);
              events.push(ev);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  } catch {
    // tolerate; fall through to blob caches
  }

  // Read 2 — source-blob caches (current collector writer)
  for (const key of SOURCE_BLOB_KEYS) {
    try {
      const payload = await redis.getJson<{ events?: unknown[] }>(key);
      if (!payload || !Array.isArray(payload.events)) continue;
      for (const ev of payload.events) {
        if (ev !== null && typeof ev === 'object' && !Array.isArray(ev)) {
          const rec = ev as { id?: unknown };
          if (typeof rec.id !== 'string' || seenIds.has(rec.id)) continue;
          seenIds.add(rec.id);
          events.push(ev);
        }
      }
    } catch {
      // tolerate single-key failures
    }
  }

  return buildLocalSignalSummary(events);
}

interface RunOnceOptions {
  signalSummary?: string;
  perplexityResp?: PerplexityResponse;
  allowlist?: string[];
  openrouterOpts?: any;
  _testBriefKey?: string;
  _callPerplexity?: typeof callPerplexity;
  signal?: AbortSignal;
}

export async function runOnce(opts?: RunOnceOptions): Promise<BriefResult> {
  const redis = getRedisAdapter();
  const briefKey = opts?._testBriefKey ?? BRIEF_GLOBAL_KEY;

  let signalSummary = opts?.signalSummary;
  if (!signalSummary) {
    try {
      signalSummary = await loadLocalSignalSummary(redis);
    } catch (err: any) {
      log.warn( 'brief-local-signals-unavailable', {
        message: err instanceof Error ? err.message : String(err),
      });
      signalSummary = '(no live signals available)';
    }
  }

  const domainEnv = process.env.SIGNALMAP_NEWS_DOMAIN_ALLOWLIST;
  const allowlist =
    opts?.allowlist ??
    (domainEnv
      ? domainEnv
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
          .slice(0, 20)
      : DEFAULT_DOMAIN_ALLOWLIST);

  const _callPerplexityFn = opts?._callPerplexity ?? callPerplexity;

  let perplexityWarnings: string[] = [];
  let perplexityResp = opts?.perplexityResp;

  if (!perplexityResp) {
    try {
      perplexityResp = await _callPerplexityFn(
        {
          messages: [
            {
              role: 'user',
              content: `Summarise the most significant global news events from the past 24 hours relevant to geopolitics, economics, security, and humanitarian issues. Focus on signal-level events. Current signal summary:
${signalSummary}`,
            },
          ],
          searchDomainFilter: allowlist,
          searchRecencyFilter: 'day',
          searchContextSize: 'medium',
          maxTokens: 800,
        },
        opts?.signal ? { signal: opts.signal } : undefined,
      );
    } catch (err: any) {
      log.warn( 'perplexity-unavailable', {
        message: err instanceof Error ? err.message : String(err),
        fallback: 'local-signals-only',
      });
      perplexityWarnings.push('External context unavailable');
      perplexityResp = {
        id: 'fallback-no-perplexity',
        model: 'sonar-pro',
        created: Math.floor(Date.now() / 1000),
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        citations: [],
        search_results: [],
      };
    }
  }

  const estCost = Number(process.env.SIGNALMAP_BRIEF_GLOBAL_EST_COST_USD ?? 0.05);
  const budget = Number(process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD ?? 5.0);

  const reserveResult = await reserveSpend(redis, estCost, budget);
  if (!reserveResult.ok) {
    log.warn( 'brief-pipeline-fallback', {
      message: `budget exhausted (running: $${reserveResult.runningTotalUsd.toFixed(
        4,
      )}, limit: $${reserveResult.budgetUsd}). Skipping brief generation.`,
    });
    throw new Error(`budget_exhausted: resets at ${reserveResult.resetsAt}`);
  }

  const model = process.env.SIGNALMAP_BRIEF_MODEL ?? 'anthropic/claude-sonnet-4.6';

  let brief: BriefResult;
  try {
    brief = await runBriefPipeline({
      perplexityResponse: perplexityResp,
      allowlist,
      currentSignalSummary: signalSummary,
      model,
      openrouterOpts: {
        ...opts?.openrouterOpts,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      },
    });
  } catch (err) {
    await refundDifference(redis, estCost, 0);
    throw err;
  }

  if (perplexityWarnings.length > 0) {
    brief.warnings = [...perplexityWarnings, ...brief.warnings];
  }

  if (typeof brief.costUsd === 'number' && isFinite(brief.costUsd)) {
    await refundDifference(redis, estCost, brief.costUsd);
  }

  emitMetric(METRICS.BRIEF_TOKENS_INPUT, brief.tokensInput ?? 0, { model: brief.model });
  emitMetric(METRICS.BRIEF_TOKENS_OUTPUT, brief.tokensOutput ?? 0, { model: brief.model });
  if (typeof brief.costUsd === 'number') {
    emitMetric(METRICS.BRIEF_COST_USD, brief.costUsd, { model: brief.model });
  }

  await redis.setJson(briefKey, brief);
  await redis.publish(BRIEF_UPDATED_CHANNEL, 'updated');

  log.info( 'brief-written', { generatedAt: brief.generatedAt, model: brief.model });
  return brief;
}

export function startCron(opts?: RunOnceOptions): { stop: () => void } {
  const intervalMs = Number(process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES ?? 30) * 60 * 1000;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let currentController: AbortController | null = null;

  async function tick() {
    const controller = new AbortController();
    currentController = controller;
    try {
      await runOnce({ ...opts, signal: controller.signal });
    } catch (err: any) {
      log.error( 'run-once-error', {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (currentController === controller) {
        currentController = null;
      }
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    }
  }

  // Run immediately on start
  tick();

  return {
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (currentController !== null) {
        currentController.abort();
        currentController = null;
      }
    },
  };
}

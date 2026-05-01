import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import type { RedisAdapter } from '../../../src/server/lib/redis.types.ts';
import type { BriefResult } from '../../../src/server/lib/brief-pipeline.js';
import { acquireOrPoll, type AcquiredLock } from '../../../src/server/lib/singleflight.js';
import { reserveSpend, refundDifference } from '../../../src/server/lib/spend-reservation.js';
import { getMinuteWindowKey, rateLimit } from '../../../src/server/lib/rate-limit.js';
import {
  synthesizePerEvent,
  type PerEventInput,
} from '../../../src/server/lib/per-event-synth.js';
import { getClientIpDynamic } from '../../../src/server/lib/client-ip.js';
import { emitMetric, METRICS } from '../../../src/server/lib/metrics.js';

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const EST_COST = () => Number(process.env.SIGNALMAP_BRIEF_EVENT_EST_COST_USD ?? 0.05);
const BUDGET = () => Number(process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD ?? 5.0);
const RATE_LIMIT_PER_MIN = () =>
  Number(process.env.SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN ?? 20);
const LOCK_TIMEOUT_SECONDS = () =>
  Number(process.env.SIGNALMAP_BRIEF_PER_EVENT_LOCK_TIMEOUT_SECONDS ?? 300);
const STAMPEDE_POLL_MS = () =>
  Number(process.env.SIGNALMAP_BRIEF_PER_EVENT_STAMPEDE_POLL_MS ?? 200);
const EVENT_CACHE_KEYS = ['signalmap:news:v1', 'signalmap:radar:v1', 'signalmap:providers:v1'];

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    return null;
  }
}

async function defaultSynthesize(
  input: PerEventInput,
  opts?: { signal?: AbortSignal },
): Promise<BriefResult> {
  return synthesizePerEvent(
    input,
    opts?.signal ? { openrouterOpts: { signal: opts.signal } } : undefined,
  );
}

let synthesizePerEventBrief: (
  input: PerEventInput,
  opts?: { signal?: AbortSignal },
) => Promise<BriefResult> = defaultSynthesize;

export function setSynthesizePerEventBrief(
  fn: (input: PerEventInput, opts?: { signal?: AbortSignal }) => Promise<BriefResult>,
): void {
  synthesizePerEventBrief = fn;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value)
    ? value.find((item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : undefined;
}

async function findCachedSignalMapEvent(
  redis: Pick<RedisAdapter, 'getJson'>,
  id: string,
): Promise<Record<string, unknown> | null> {
  for (const key of EVENT_CACHE_KEYS) {
    let payload: { events?: unknown[] } | null = null;
    try {
      payload = await redis.getJson<{ events?: unknown[] }>(key);
    } catch {
      continue;
    }
    const events = Array.isArray(payload?.events) ? payload.events : [];
    for (const event of events) {
      if (event !== null && typeof event === 'object' && !Array.isArray(event)) {
        const record = event as Record<string, unknown>;
        if (record['id'] === id) return record;
      }
    }
  }
  return null;
}

function eventInputFromRecord(id: string, record: Record<string, unknown> | null): Partial<PerEventInput> {
  if (!record) return {};
  const location = firstRecord(record['locations']);
  const source = firstRecord(record['sources']);
  return {
    id,
    ...(cleanString(record['title']) ? { title: cleanString(record['title']) } : {}),
    ...(cleanString(record['summary']) ? { summary: cleanString(record['summary']) } : {}),
    ...(cleanString(record['category']) ? { category: cleanString(record['category']) } : {}),
    ...(cleanString(record['severity']) ? { severity: cleanString(record['severity']) } : {}),
    ...(cleanString(location?.['name']) ? { locationName: cleanString(location?.['name']) } : {}),
    ...(cleanString(record['provider']) ? { provider: cleanString(record['provider']) } : {}),
    ...(cleanString(source?.['label']) ? { sourceLabel: cleanString(source?.['label']) } : {}),
    ...(cleanString(source?.['url']) ? { sourceUrl: cleanString(source?.['url']) } : {}),
  };
}

export async function handleSignalMapBriefEvent(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const redis = getRedisAdapter();

  const parsed = new URL(req.url ?? '/', 'http://localhost');
  const segments = parsed.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1] ?? '';

  if (!id || !ID_PATTERN.test(id)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: { code: 'invalid_id', message: 'Event ID must be non-empty alphanumeric with - or _' },
      }),
    );
    return;
  }

  emitMetric(METRICS.BRIEF_CALLS, 1, { flavor: 'per_event', id });
  const cacheKey = `signalmap:brief:event:${id}`;
  const lockKey = `signalmap:brief:event:lock:${id}`;
  const rlPrefix = 'signalmap:rl:event-brief';

  let cached: BriefResult | null;
  try {
    cached = await redis.getJson<BriefResult>(cacheKey);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: 'Redis is unavailable' } }));
    return;
  }

  if (cached !== null) {
    emitMetric(METRICS.BRIEF_CACHE_HITS, 1, { flavor: 'per_event', id });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache', 'HIT');
    res.end(JSON.stringify(cached));
    return;
  }

  const ip = getClientIpDynamic(req);
  const rlKey = getMinuteWindowKey(rlPrefix, ip);
  const rlResult = await rateLimit(redis, rlKey, RATE_LIMIT_PER_MIN());

  if (!rlResult.allowed) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', String(rlResult.retryAfterSeconds));
    res.end(
      JSON.stringify({
        error: { code: 'rate_limited', retry_after_seconds: rlResult.retryAfterSeconds },
      }),
    );
    return;
  }

  const holderId = `pid-${process.pid}-${randomUUID()}`;
  const sfResult = await acquireOrPoll<BriefResult>(redis, lockKey, cacheKey, holderId, {
    ttlSeconds: LOCK_TIMEOUT_SECONDS(),
    pollIntervalMs: STAMPEDE_POLL_MS(),
    maxWaitMs: 30_000,
    renewal: true,
  });

  if (!sfResult.acquired) {
    if (sfResult.cached !== null) {
      emitMetric(METRICS.BRIEF_CACHE_HITS, 1, { flavor: 'per_event', id });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Cache', 'HIT');
      res.end(JSON.stringify(sfResult.cached));
      return;
    }
    emitMetric(METRICS.BRIEF_LOCK_CONTENTION, 1, { flavor: 'per_event', id });
    if (sfResult.reason === 'stampede_timeout') {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'stampede_timeout' } }));
      return;
    }
  }

  // sfResult.acquired === true at this point — narrow to AcquiredLock
  const lock = sfResult as AcquiredLock;

  // Wrap the entire post-acquire region in try/finally so an uncaught throw
  // (e.g. Redis getJson failure inside findCachedSignalMapEvent) cannot leak
  // the renewal timer. release() is idempotent; .catch swallows release-time
  // Redis failures so they don't poison a successful response.
  try {
    const reserveResult = await reserveSpend(redis, EST_COST(), BUDGET());
    if (!reserveResult.ok) {
      emitMetric(METRICS.BRIEF_BUDGET_REFUSALS, 1, { flavor: 'per_event', id });
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ error: { code: 'budget_exhausted', resets_at: reserveResult.resetsAt } }),
      );
      return;
    }

    // Read JSON body to populate event input fields
    interface EventBody {
      title?: string;
      summary?: string;
      category?: string;
      severity?: string;
      locationName?: string;
      provider?: string;
      sourceLabel?: string;
      sourceUrl?: string;
    }
    const body = await readJsonBody<EventBody>(req);
    const cachedEvent = await findCachedSignalMapEvent(redis, id);
    const cachedInput = eventInputFromRecord(id, cachedEvent);
    const input: PerEventInput = {
      id,
      ...cachedInput,
      ...(body?.title !== undefined ? { title: body.title } : {}),
      ...(body?.summary !== undefined ? { summary: body.summary } : {}),
      ...(body?.category !== undefined ? { category: body.category } : {}),
      ...(body?.severity !== undefined ? { severity: body.severity } : {}),
      ...(body?.locationName !== undefined ? { locationName: body.locationName } : {}),
      ...(body?.provider !== undefined ? { provider: body.provider } : {}),
      ...(body?.sourceLabel !== undefined ? { sourceLabel: body.sourceLabel } : {}),
      ...(body?.sourceUrl !== undefined ? { sourceUrl: body.sourceUrl } : {}),
    };

    let brief: BriefResult;
    try {
      // Pass lock.signal so the LLM call aborts if we lose ownership.
      brief = await synthesizePerEventBrief(input, { signal: lock.signal });
    } catch (err) {
      await refundDifference(redis, EST_COST(), 0);
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'synthesis_failed', message } }));
      return;
    }

    if (typeof brief.costUsd === 'number') {
      await refundDifference(redis, EST_COST(), brief.costUsd);
    }

    await redis.setJson(cacheKey, brief);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache', 'MISS');
    res.end(JSON.stringify(brief));
  } finally {
    await lock.release().catch(() => undefined);
  }
}

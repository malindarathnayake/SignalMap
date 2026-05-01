/**
 * GET /api/signalmap/health
 *
 * Returns a strict-shape health snapshot for the UI Health panel.
 * The shape is validated against HealthResponse.parse() before responding —
 * any shape drift surfaces as a 500 with code "shape_drift".
 *
 * In production mode (SIGNALMAP_BACKEND_MODE=live), detail fields that contain
 * connection URIs, filesystem paths, or key prefixes are replaced with
 * '<redacted-in-production>' before the response is sent.
 *
 * NOTE: lancedb probe is a Phase 3+ concern. For now we report 'unknown' or
 * read the heartbeat once Phase 3 writes signalmap:lancedb:heartbeat.
 *
 * NOTE: 'degraded' for worker components means heartbeat is present but
 * the last-tick status.outcome === 'fail'. 'down' means heartbeat key is absent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import type { RedisAdapter } from '../../../src/server/lib/redis.types.ts';
import { HealthResponse } from '../schemas/signalmap.js';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthResponseT = z.infer<typeof HealthResponse>;
type ComponentHealthT = HealthResponseT['redis'];
type HealthSourceRowT = HealthResponseT['sources'][number];

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------

const KEY_COLLECTOR_HEARTBEAT = 'signalmap:collector:heartbeat';
const KEY_COLLECTOR_STATUS = 'signalmap:collector:status';
const KEY_BRIEF_HEARTBEAT = 'signalmap:brief:cron:heartbeat';
const KEY_BRIEF_STATUS = 'signalmap:brief:cron:status';
const KEY_LLM_OPENROUTER = 'signalmap:llm:lastcall:openrouter';
const KEY_LLM_PERPLEXITY = 'signalmap:llm:lastcall:perplexity';
const KEY_LANCEDB_HEARTBEAT = 'signalmap:lancedb:heartbeat';
const KEY_META_NEWS = 'seed-meta:signalmap:news';
const KEY_META_RADAR = 'seed-meta:signalmap:radar';
const KEY_META_PROVIDERS = 'seed-meta:signalmap:providers';

// ---------------------------------------------------------------------------
// Redaction patterns
// ---------------------------------------------------------------------------

const REDACT_PATTERNS = ['redis://', '/data/', 'sk-', 'pplx-'];

function shouldRedact(detail: string): boolean {
  return REDACT_PATTERNS.some((pat) => detail.includes(pat));
}

function redactInPlace(response: HealthResponseT): void {
  const components: Array<ComponentHealthT> = [
    response.redis,
    response.lancedb,
    response.collector,
    response.brief,
    response.openrouter,
    response.perplexity,
  ];
  for (const component of components) {
    if (typeof component.detail === 'string' && shouldRedact(component.detail)) {
      component.detail = '<redacted-in-production>';
    }
  }
}

// ---------------------------------------------------------------------------
// Redis probe helpers
// ---------------------------------------------------------------------------

/**
 * Probe Redis health by running a PING via pipeline.
 * Returns latencyMs in metrics on success.
 */
async function probeRedis(redis: RedisAdapter): Promise<ComponentHealthT> {
  const start = Date.now();
  try {
    await redis.pipeline([['PING']]);
    const latencyMs = Date.now() - start;
    return {
      status: 'ok',
      metrics: { latencyMs },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'down',
      detail: msg,
    };
  }
}

/**
 * Probe LanceDB. Phase 3+ will write signalmap:lancedb:heartbeat.
 * For now, read the key if present; otherwise report 'unknown'.
 */
async function probeLancedb(redis: RedisAdapter): Promise<ComponentHealthT> {
  try {
    const hb = await redis.getJson<{ ts?: string | number }>(KEY_LANCEDB_HEARTBEAT);
    if (hb !== null) {
      return { status: 'ok' };
    }
    // Phase 3+ concern — no writers yet
    return { status: 'unknown', detail: 'Heartbeat not yet written (Phase 3+)' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'down', detail: msg };
  }
}

/**
 * Interface for the last-tick status key written by worker phases.
 */
interface WorkerStatus {
  outcome?: string;
  eventCount?: number;
  model?: string;
  errorMessage?: string;
}

/**
 * Probe a worker component via its heartbeat + status keys.
 *
 * Status rules:
 *   - heartbeat absent → 'down'
 *   - heartbeat present + status.outcome === 'fail' → 'degraded'
 *   - heartbeat present + outcome OK (or no status key) → 'ok'
 */
async function probeWorker(
  redis: RedisAdapter,
  heartbeatKey: string,
  statusKey: string,
): Promise<ComponentHealthT> {
  let hb: unknown = null;
  try {
    hb = await redis.getJson<unknown>(heartbeatKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'down', detail: msg };
  }

  if (hb === null) {
    return { status: 'down', detail: 'Heartbeat key absent or expired' };
  }

  let lastStatus: WorkerStatus | null = null;
  try {
    lastStatus = await redis.getJson<WorkerStatus>(statusKey);
  } catch {
    // status unavailable — fall through
  }

  const outcome = lastStatus?.outcome;
  if (outcome === 'fail') {
    const metrics: Record<string, string | number> = {};
    if (typeof lastStatus?.eventCount === 'number') metrics['eventCount'] = lastStatus.eventCount;
    return {
      status: 'degraded',
      detail: lastStatus?.errorMessage ?? 'Last tick reported failure',
      metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    };
  }

  const metrics: Record<string, string | number> = {};
  if (typeof lastStatus?.eventCount === 'number') metrics['eventCount'] = lastStatus.eventCount;

  return {
    status: 'ok',
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
  };
}

/**
 * Interface for the last-LLM-call key written by the brief pipeline.
 */
interface LlmLastCall {
  calledAt?: string;
  outcome?: string;
  model?: string;
}

/**
 * Probe an LLM component by reading its last-call key.
 * Recency threshold: 24 h (86400 s). Adjust if needed.
 *
 * Status rules:
 *   - key absent → 'unknown' (no calls yet)
 *   - present + recent + outcome === 'success' → 'ok'
 *   - present + recent + outcome !== 'success' → 'degraded'
 *   - present but very old → 'degraded'
 */
async function probeLlm(redis: RedisAdapter, key: string): Promise<ComponentHealthT> {
  let data: LlmLastCall | null = null;
  try {
    data = await redis.getJson<LlmLastCall>(key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'down', detail: msg };
  }

  if (data === null) {
    return { status: 'unknown', detail: 'No calls recorded yet' };
  }

  const calledAtMs = data.calledAt ? new Date(data.calledAt).getTime() : NaN;
  const ageMs = isNaN(calledAtMs) ? Infinity : Date.now() - calledAtMs;
  const STALE_MS = 24 * 60 * 60 * 1000; // 24 h

  const detail = data.model
    ? `model: ${data.model}; lastCall: ${data.calledAt ?? 'unknown'}`
    : `lastCall: ${data.calledAt ?? 'unknown'}`;

  if (data.outcome === 'success' && ageMs < STALE_MS) {
    return { status: 'ok', detail };
  }

  return {
    status: 'degraded',
    detail: `outcome: ${data.outcome ?? 'unknown'}; ${detail}`,
  };
}

// ---------------------------------------------------------------------------
// Source freshness helpers
// ---------------------------------------------------------------------------

interface SeedMeta {
  fetchedAt?: number;
  recordCount?: number;
  pollMinutes?: number;
}

interface SourceDef {
  id: string;
  label: string;
  metaKey: string;
  maxAgeSeconds: number;
  tier: number;
}

const SOURCE_DEFS: SourceDef[] = [
  { id: 'news', label: 'News', metaKey: KEY_META_NEWS, maxAgeSeconds: 1800, tier: 2 },
  { id: 'cloudflare-radar', label: 'Cloudflare Radar', metaKey: KEY_META_RADAR, maxAgeSeconds: 600, tier: 1 },
  { id: 'provider-status', label: 'Provider Status', metaKey: KEY_META_PROVIDERS, maxAgeSeconds: 600, tier: 1 },
];

function maxAgeSecondsFor(def: SourceDef, meta: SeedMeta): number {
  const pollMinutes = Number(meta.pollMinutes);
  if (!Number.isFinite(pollMinutes) || pollMinutes <= 0) return def.maxAgeSeconds;
  return Math.max(def.maxAgeSeconds, Math.ceil(pollMinutes * 60 * 2));
}

async function readSources(redis: RedisAdapter, now: number): Promise<HealthSourceRowT[]> {
  const rows: HealthSourceRowT[] = [];

  for (const def of SOURCE_DEFS) {
    let meta: SeedMeta | null = null;
    try {
      meta = await redis.getJson<SeedMeta>(def.metaKey);
    } catch {
      // treat as missing
    }

    if (meta === null || typeof meta.fetchedAt !== 'number') {
      rows.push({ id: def.id, label: def.label, status: 'stale', latencyMs: 0, tier: def.tier });
      continue;
    }

    const ageSeconds = (now - meta.fetchedAt) / 1000;
    const maxAgeSeconds = maxAgeSecondsFor(def, meta);
    const status: 'ok' | 'stale' = ageSeconds > maxAgeSeconds ? 'stale' : 'ok';
    rows.push({ id: def.id, label: def.label, status, latencyMs: 0, tier: def.tier });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Core builder (pure function, injectable for tests)
// ---------------------------------------------------------------------------

export async function buildHealthResponse(
  redis: RedisAdapter,
  mode: string | undefined,
  now: number,
): Promise<HealthResponseT> {
  // TODO: Re-enable probes for lancedb, openrouter, and perplexity once Phase 3+ writers are in prod.
  const [redisCard, collectorCard, briefCard, sources] = await Promise.all([
    probeRedis(redis),
    probeWorker(redis, KEY_COLLECTOR_HEARTBEAT, KEY_COLLECTOR_STATUS),
    probeWorker(redis, KEY_BRIEF_HEARTBEAT, KEY_BRIEF_STATUS),
    readSources(redis, now),
  ]);

  const response: HealthResponseT = {
    redis: redisCard,
    lancedb: { status: 'unknown', detail: 'Probing disabled until writers are implemented' },
    collector: collectorCard,
    brief: briefCard,
    openrouter: { status: 'unknown', detail: 'Probing disabled until writers are implemented' },
    perplexity: { status: 'unknown', detail: 'Probing disabled until writers are implemented' },
    sources,
    generatedAt: new Date(now).toISOString(),
  };

  if (mode === 'live') {
    redactInPlace(response);
  }

  return response;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export async function handleSignalMapHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let redis: RedisAdapter;
  try {
    redis = getRedisAdapter();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: msg } }));
    return;
  }

  const response = await buildHealthResponse(redis, process.env.SIGNALMAP_BACKEND_MODE, Date.now());

  let parsed: HealthResponseT;
  try {
    parsed = HealthResponse.parse(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'shape_drift', message: msg } }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(parsed));
}

import type { z } from 'zod';
import type { RedisAdapter } from '../../../src/server/lib/redis.types.ts';
import { SignalMapSourceHealth } from '../schemas/common.js';

type SignalMapSourceHealthT = z.infer<typeof SignalMapSourceHealth>;

const KEY_NEWS = 'signalmap:news:v1';
const KEY_RADAR = 'signalmap:radar:v1';
const KEY_PROVIDERS = 'signalmap:providers:v1';
const KEY_META_NEWS = 'seed-meta:signalmap:news';
const KEY_META_RADAR = 'seed-meta:signalmap:radar';
const KEY_META_PROVIDERS = 'seed-meta:signalmap:providers';

interface CachePayload {
  fetchedAt?: string;
  pollMinutes?: number;
  events?: unknown[];
  sourceHealth?: unknown[];
  health?: {
    sources?: unknown[];
  };
}

interface SeedMeta {
  fetchedAt?: number;
  recordCount?: number;
  sourceVersion?: string;
  pollMinutes?: number;
}

interface SourceDef {
  id: string;
  label: string;
  metaKey: string;
  maxAgeSeconds: number;
}

const SOURCE_DEFS: SourceDef[] = [
  { id: 'news', label: 'News', metaKey: KEY_META_NEWS, maxAgeSeconds: 1800 },
  { id: 'cloudflare-radar', label: 'Cloudflare Radar', metaKey: KEY_META_RADAR, maxAgeSeconds: 600 },
  { id: 'provider-status', label: 'Provider Status', metaKey: KEY_META_PROVIDERS, maxAgeSeconds: 600 },
];

function maxAgeSecondsFor(def: SourceDef, meta: SeedMeta): number {
  const pollMinutes = Number(meta.pollMinutes);
  if (!Number.isFinite(pollMinutes) || pollMinutes <= 0) return def.maxAgeSeconds;
  return Math.max(def.maxAgeSeconds, Math.ceil(pollMinutes * 60 * 2));
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function sourceIdFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `news:${slug || 'source'}`;
}

function normalizeStatus(source: Record<string, unknown>): 'ok' | 'degraded' | 'unavailable' {
  const raw = cleanString(source['status'])?.toLowerCase();
  if (raw === 'unavailable') return 'unavailable';
  if (
    raw === 'degraded' ||
    source['llmUnavailable'] === true ||
    source['distillDegraded'] === true ||
    toInt(source['errors']) > 0
  ) {
    return 'degraded';
  }
  return 'ok';
}

function buildDetail(source: Record<string, unknown>): string {
  const fetched = toInt(source['fetched']);
  const accepted = toInt(source['accepted']);
  const skipped = toInt(source['skipped']);
  const errors = toInt(source['errors']);
  const parts = [`fetched ${fetched}`, `accepted ${accepted}`, `skipped ${skipped}`];
  if (errors > 0) parts.push(`errors ${errors}`);

  const lastError = cleanString(source['lastError']);
  if (lastError) parts.push(`error ${lastError}`);

  const lastLlmReason = cleanString(source['lastLlmReason']);
  if (source['llmUnavailable'] === true || lastLlmReason) {
    parts.push(`llm ${lastLlmReason ?? 'unavailable'}`);
  }

  const lastDistillReason = cleanString(source['lastDistillReason']);
  if (source['distillDegraded'] === true || lastDistillReason) {
    parts.push(`distill ${lastDistillReason ?? 'degraded'}`);
  }

  return `${parts.join('; ')}.`;
}

function newsSourceHealthRows(payload: CachePayload | null): SignalMapSourceHealthT[] {
  const fetchedAt = Date.parse(cleanString(payload?.fetchedAt) ?? '');
  const fetchedAtMs = Number.isFinite(fetchedAt) ? fetchedAt : 0;
  const sources = Array.isArray(payload?.health?.sources) ? payload.health.sources : [];
  const rows: SignalMapSourceHealthT[] = [];

  for (const raw of sources) {
    if (raw === null || typeof raw !== 'object') continue;
    const source = raw as Record<string, unknown>;
    const label =
      cleanString(source['name']) ??
      cleanString(source['sourceName']) ??
      cleanString(source['feedUrl']) ??
      'News source';

    rows.push({
      id: sourceIdFromLabel(label),
      label,
      status: normalizeStatus(source),
      fetchedAt: fetchedAtMs,
      eventCount: toInt(source['accepted']),
      detail: buildDetail(source),
    });
  }

  return rows;
}

function normalizeHealthStatus(value: unknown): 'ok' | 'degraded' | 'unavailable' {
  const raw = cleanString(value)?.toLowerCase();
  if (raw === 'ok') return 'ok';
  if (raw === 'degraded') return 'degraded';
  return 'unavailable';
}

function toFetchedAtMs(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(cleanString(value) ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cachedSourceHealthRows(payload: CachePayload | null): SignalMapSourceHealthT[] {
  const fetchedAt = Date.parse(cleanString(payload?.fetchedAt) ?? '');
  const fallbackFetchedAtMs = Number.isFinite(fetchedAt) ? fetchedAt : 0;
  const rows = Array.isArray(payload?.sourceHealth) ? payload.sourceHealth : [];
  const normalized: SignalMapSourceHealthT[] = [];

  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const id = cleanString(row['id']);
    const label = cleanString(row['label']);
    if (!id || !label) continue;

    normalized.push({
      id,
      label,
      status: normalizeHealthStatus(row['status']),
      fetchedAt: toFetchedAtMs(row['fetchedAt'], fallbackFetchedAtMs),
      eventCount: toInt(row['eventCount']),
      detail: cleanString(row['detail']) ?? '',
    });
  }

  return normalized;
}

function upsertSourceHealth(
  results: SignalMapSourceHealthT[],
  row: SignalMapSourceHealthT,
): void {
  const index = results.findIndex((entry) => entry.id === row.id);
  if (index >= 0) {
    results[index] = row;
    return;
  }
  results.push(row);
}

export async function getSignalMapSourceHealth(
  redis: RedisAdapter,
  now: number,
): Promise<SignalMapSourceHealthT[]> {
  const results: SignalMapSourceHealthT[] = [];

  for (const def of SOURCE_DEFS) {
    let meta: SeedMeta | null = null;
    try {
      meta = await redis.getJson<SeedMeta>(def.metaKey);
    } catch {
      // treat as unavailable
    }

    if (meta === null || typeof meta.fetchedAt !== 'number') {
      results.push({
        id: def.id,
        label: def.label,
        status: 'unavailable',
        fetchedAt: 0,
        eventCount: 0,
        detail: 'No cached payload available.',
      });
      continue;
    }

    const ageSeconds = (now - meta.fetchedAt) / 1000;
    const maxAgeSeconds = maxAgeSecondsFor(def, meta);
    const status: 'ok' | 'degraded' = ageSeconds > maxAgeSeconds ? 'degraded' : 'ok';
    const eventCount = typeof meta.recordCount === 'number' ? meta.recordCount : 0;

    results.push({
      id: def.id,
      label: def.label,
      status,
      fetchedAt: meta.fetchedAt,
      eventCount,
      detail: status === 'ok' ? 'Fresh.' : `Stale by ${Math.floor(ageSeconds - maxAgeSeconds)}s.`,
    });
  }

  try {
    const newsPayload = await redis.getJson<CachePayload>(KEY_NEWS);
    results.push(...newsSourceHealthRows(newsPayload));
  } catch {
    // The aggregate news row already reports cache freshness; sub-source rows
    // are best-effort metadata from the collector payload.
  }

  try {
    const radarPayload = await redis.getJson<CachePayload>(KEY_RADAR);
    for (const row of cachedSourceHealthRows(radarPayload)) {
      if (row.id === 'cloudflare-radar') upsertSourceHealth(results, row);
    }
  } catch {
    // Aggregate Radar metadata already reports cache freshness.
  }

  try {
    const providerPayload = await redis.getJson<CachePayload>(KEY_PROVIDERS);
    results.push(...cachedSourceHealthRows(providerPayload));
  } catch {
    // Aggregate provider metadata already reports cache freshness.
  }

  return results;
}

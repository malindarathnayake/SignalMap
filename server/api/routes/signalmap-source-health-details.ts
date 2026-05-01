import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import { getSignalMapSourceHealth } from './signalmap-source-health-core.ts';

/**
 * /api/signalmap/source-health-details — LLM-friendly enriched source-health.
 *
 * Same data the SPA's /source-health-details page renders, served as a
 * structured JSON object so an operator (or an LLM agent) can curl it
 * and get every diagnostic fact in one shot:
 *   - parsed counts (fetched / accepted / rejected) extracted from the
 *     collector's free-form `detail` string
 *   - upstream URL (where each source is actually polled)
 *   - env-key requirement hint (so missing-key sources surface clearly)
 *   - domain category (radar / status / news / other) for grouping
 *   - live ingest progress when a tick is running
 *
 * Different from /api/signalmap/source-health which returns the raw
 * source-health rows + progress; this endpoint additionally annotates
 * each row with derived fields the UI/agent would otherwise have to
 * compute, AND lists every known source even if the collector hasn't
 * reported it yet (so a freshly-disabled source is still visible).
 */

interface RawSourceHealth {
  id: string;
  label: string;
  status: string;
  fetchedAt?: number;
  eventCount?: number;
  detail?: string;
  tier?: number;
  latencyMs?: number;
}

interface CollectorProgressSource {
  name: string;
  fetched: number;
  processed: number;
  accepted: number;
  rejected: number;
}

interface CollectorProgress {
  stage: string;
  currentSource: string;
  articlesProcessed: number;
  articlesTotal: number;
  articlesAccepted: number;
  updatedAt: string;
  sources?: CollectorProgressSource[];
}

type Domain = 'radar' | 'status' | 'news' | 'umbrella' | 'other';

const SOURCE_UPSTREAM: Record<string, string> = {
  'cloudflare-radar': 'https://api.cloudflare.com/client/v4/radar/annotations/outages',
  'provider-status:cloudflare-status': 'https://www.cloudflarestatus.com/api/v2/summary.json',
  'provider-status:openai-status': 'https://status.openai.com/api/v2/summary.json',
  'provider-status:anthropic-status': 'https://status.claude.com/api/v2/summary.json',
  'provider-status:azure-status': 'https://azurestatuscdn.azureedge.net/en-us/status/feed/',
  'provider-status:okta-status': 'https://feeds.feedburner.com/OktaStatusRSS',
  'provider-status:aws-lambda-use1': 'https://status.aws.amazon.com/rss/lambda-us-east-1.rss',
  'provider-status:aws-lambda-use2': 'https://status.aws.amazon.com/rss/lambda-us-east-2.rss',
  'provider-status:aws-rds-use1': 'https://status.aws.amazon.com/rss/rds-us-east-1.rss',
  'provider-status:aws-s3-use1': 'https://status.aws.amazon.com/rss/s3-us-standard.rss',
  'provider-status:wasabi-status': 'https://status.wasabi.com/history.rss',
  'provider-status:gdelt': 'http://data.gdeltproject.org/gkg/index.html',
  'news:the-hacker-news': 'https://feeds.feedburner.com/TheHackersNews',
  'news:dark-reading': 'https://www.darkreading.com/rss.xml',
  'news:newsapi': 'https://newsapi.org/v2/top-headlines?language=en&category=technology',
};

const SOURCE_REQUIRES_ENV_KEY: Record<string, string> = {
  'news:newsapi': 'NEWSAPI_API_KEY',
};

function domainOf(id: string): Domain {
  if (id === 'cloudflare-radar' || id.startsWith('radar:')) return 'radar';
  if (id.startsWith('provider-status:')) return 'status';
  if (id.startsWith('news:')) return 'news';
  if (id === 'news' || id === 'provider-status') return 'umbrella';
  return 'other';
}

interface ParsedCounts {
  fetched: number | null;
  accepted: number | null;
  rejected: number | null;
  reasons: string[];
}
function parseCounts(detail: string | undefined): ParsedCounts {
  const out: ParsedCounts = { fetched: null, accepted: null, rejected: null, reasons: [] };
  if (!detail) return out;
  const m = (re: RegExp) => re.exec(detail)?.[1];
  const f = m(/fetched\s+(\d+)/i);
  const a = m(/accepted\s+(\d+)/i);
  const s = m(/skipped\s+(\d+)/i);
  if (f) out.fetched = Number(f);
  if (a) out.accepted = Number(a);
  if (s) out.rejected = Number(s);
  const tail = detail
    .replace(/(fetched|accepted|skipped)\s+\d+;?\s*/gi, '')
    .split(/[.;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  out.reasons = tail;
  return out;
}

// Diagnostic emitted by the collector for every article-level decision.
// Stored on `signalmap:news:v1` → `health.diagnostics[]`. Reasons currently
// observed: low_signal_confidence, duplicate_persisted, duplicate_url,
// duplicate_title, parse_failed, missing_api_key, http_error, fetch_error,
// semantic_duplicate.
interface NewsDiagnostic {
  sourceName?: string;
  stage?: string;
  reason?: string;
  confidence?: number;
  threshold?: number;
  status?: string;
}

interface RejectionBreakdownEntry {
  reason: string;
  count: number;
  // For low_signal_confidence: stats on the confidence distribution that
  // got dropped — lets the operator see "max=0.62 < threshold=0.7" so the
  // calibration story is visible without staring at a histogram.
  avgConfidence?: number;
  maxConfidence?: number;
  threshold?: number;
  // Human-friendly explanation rendered next to the chip on the SPA card.
  // Maps reason → why the article was dropped, in plain English.
  explanation: string;
}

const REASON_EXPLANATIONS: Record<string, string> = {
  low_signal_confidence: 'LLM rated below the confidence threshold (off-topic / low-impact)',
  duplicate_persisted: 'Already accepted in a previous tick (cross-tick dedupe)',
  duplicate_url: 'Same URL already seen this tick',
  duplicate_title: 'Same title hash already seen this tick',
  semantic_duplicate: 'Vector search found a near-duplicate story already published',
  parse_failed: 'LLM failed to return valid JSON for this article',
  missing_api_key: 'OPENROUTER_API_KEY not configured',
  no_allowed_models: 'No LLM models allowed in current config',
  http_error: 'Upstream feed returned a non-200 HTTP status',
  fetch_error: 'Network error fetching the feed',
  newsapi_api_key_missing: 'NEWSAPI_API_KEY not configured',
  fallback: 'Distill extraction fell back to RSS summary',
  embedding_failed: 'Embedding model could not produce a vector',
  vector_lookup_error: 'LanceDB lookup failed',
};

interface DetailedSource {
  id: string;
  label: string;
  domain: Domain;
  status: string;
  upstreamUrl: string | null;
  requiresEnvKey: string | null;
  fetchedAt: number;
  fetchedAtIso: string | null;
  ageSeconds: number | null;
  eventCount: number;
  tier: number;
  latencyMs: number;
  detail: string;
  counts: ParsedCounts;
  rejections: RejectionBreakdownEntry[];
  flags: {
    isQuiet: boolean; // fetch ok but 0 accepted in current window
    isDisabled: boolean;
    hasError: boolean;
  };
}

// Slug mirrors `sourceIdFromLabel` in signalmap-source-health-core.ts so
// "The Hacker News" → "news:the-hacker-news" and we can join diagnostics
// (which carry the human-readable sourceName) to the row id.
function sourceIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `news:${slug || 'source'}`;
}

function aggregateRejections(
  diagnostics: NewsDiagnostic[],
): Map<string, RejectionBreakdownEntry[]> {
  // sourceId → reason → { count, sumConfidence, maxConfidence, threshold }
  const accum = new Map<
    string,
    Map<string, { count: number; sum: number; max: number; samples: number; threshold?: number }>
  >();
  for (const diag of diagnostics) {
    const sourceName = typeof diag.sourceName === 'string' ? diag.sourceName : '';
    const reason = typeof diag.reason === 'string' ? diag.reason : '';
    if (!sourceName || !reason) continue;
    const sourceId = sourceIdFromName(sourceName);
    let bySource = accum.get(sourceId);
    if (!bySource) {
      bySource = new Map();
      accum.set(sourceId, bySource);
    }
    let entry = bySource.get(reason);
    if (!entry) {
      entry = { count: 0, sum: 0, max: 0, samples: 0, threshold: undefined };
      bySource.set(reason, entry);
    }
    entry.count += 1;
    if (typeof diag.confidence === 'number' && Number.isFinite(diag.confidence)) {
      entry.sum += diag.confidence;
      entry.max = Math.max(entry.max, diag.confidence);
      entry.samples += 1;
    }
    if (typeof diag.threshold === 'number' && Number.isFinite(diag.threshold)) {
      entry.threshold = diag.threshold;
    }
  }

  const out = new Map<string, RejectionBreakdownEntry[]>();
  for (const [sourceId, bySource] of accum.entries()) {
    const list: RejectionBreakdownEntry[] = [];
    for (const [reason, entry] of bySource.entries()) {
      list.push({
        reason,
        count: entry.count,
        ...(entry.samples > 0
          ? {
              avgConfidence: Number((entry.sum / entry.samples).toFixed(2)),
              maxConfidence: Number(entry.max.toFixed(2)),
            }
          : {}),
        ...(typeof entry.threshold === 'number' ? { threshold: entry.threshold } : {}),
        explanation: REASON_EXPLANATIONS[reason] ?? reason.replace(/_/g, ' '),
      });
    }
    list.sort((a, b) => b.count - a.count);
    out.set(sourceId, list);
  }
  return out;
}

interface DetailedResponse {
  generatedAt: string;
  fetchedAt: number;
  summary: {
    total: number;
    ok: number;
    degraded: number;
    down: number;
    disabled: number;
    quiet: number;
  };
  progress: CollectorProgress | null;
  sources: DetailedSource[];
}

export async function handleSignalMapSourceHealthDetails(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let redis;
  try {
    redis = getRedisAdapter();
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'store_unavailable', message: 'Redis is unavailable' } }));
    return;
  }

  const now = Date.now();
  const rows = (await getSignalMapSourceHealth(redis, now)) as RawSourceHealth[];

  let progress: CollectorProgress | null = null;
  try {
    const raw = await redis.getJson<CollectorProgress>('signalmap:collector:progress:v1');
    if (raw && typeof raw === 'object') {
      const updatedAtMs = Date.parse(String(raw.updatedAt ?? ''));
      const ageMs = Number.isFinite(updatedAtMs) ? now - updatedAtMs : Infinity;
      const isFresh = ageMs < 60_000;
      const isActive = raw.stage !== 'done' && raw.stage !== 'idle';
      if (isFresh && isActive) progress = raw;
    }
  } catch {
    // tolerate
  }

  // Aggregate per-source rejection reasons from the news payload's
  // diagnostics array. Lets the SPA render "low_signal_confidence ×31
  // (max 0.62 < threshold 0.70)" so an operator sees WHY articles were
  // dropped, not just THAT they were.
  let rejectionsBySource = new Map<string, RejectionBreakdownEntry[]>();
  try {
    const newsPayload = await redis.getJson<{
      health?: { diagnostics?: NewsDiagnostic[] };
    }>('signalmap:news:v1');
    const diagnostics = Array.isArray(newsPayload?.health?.diagnostics)
      ? newsPayload!.health!.diagnostics!
      : [];
    rejectionsBySource = aggregateRejections(diagnostics);
  } catch {
    // tolerate; rejections are informational, never fail the response
  }

  const sources: DetailedSource[] = rows
    .filter((r) => domainOf(r.id) !== 'umbrella')
    .map((r) => {
      const detail = typeof r.detail === 'string' ? r.detail : '';
      const counts = parseCounts(detail);
      const fetchedAt = typeof r.fetchedAt === 'number' && r.fetchedAt > 0 ? r.fetchedAt : 0;
      const ageSeconds = fetchedAt > 0 ? Math.floor((now - fetchedAt) / 1000) : null;
      const isDisabled = r.status === 'disabled';
      const hasError = /error|fail|invalid|timeout|http_\d+/i.test(detail);
      const isQuiet =
        r.status === 'ok'
        && counts.fetched !== null
        && counts.fetched > 0
        && counts.accepted === 0;
      return {
        id: r.id,
        label: r.label,
        domain: domainOf(r.id),
        status: r.status,
        upstreamUrl: SOURCE_UPSTREAM[r.id] ?? null,
        requiresEnvKey: SOURCE_REQUIRES_ENV_KEY[r.id] ?? null,
        fetchedAt,
        fetchedAtIso: fetchedAt > 0 ? new Date(fetchedAt).toISOString() : null,
        ageSeconds,
        eventCount: typeof r.eventCount === 'number' ? r.eventCount : 0,
        tier: typeof r.tier === 'number' ? r.tier : 1,
        latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : 0,
        detail,
        counts,
        rejections: rejectionsBySource.get(r.id) ?? [],
        flags: { isQuiet, isDisabled, hasError },
      };
    });

  const summary = {
    total: sources.length,
    ok: sources.filter((s) => s.status === 'ok').length,
    degraded: sources.filter((s) => s.status === 'degraded').length,
    down: sources.filter((s) => s.status === 'down' || s.status === 'stale').length,
    disabled: sources.filter((s) => s.flags.isDisabled).length,
    quiet: sources.filter((s) => s.flags.isQuiet).length,
  };

  const body: DetailedResponse = {
    generatedAt: new Date(now).toISOString(),
    fetchedAt: now,
    summary,
    progress,
    sources,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.end(JSON.stringify(body));
}

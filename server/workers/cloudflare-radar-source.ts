import type {
  SignalMapEvent,
  SignalMapSourceHealth,
} from '../../src/generated/server/worldmonitor/signalmap/v1/service_server.ts';
import type { RedisAdapter } from '../../src/server/lib/redis.types.ts';
import {
  normalizeCloudflareRadar,
  RADAR_SOURCE_ID,
} from '../worldmonitor/signalmap/v1/_radar.ts';

export const SIGNALMAP_RADAR_CACHE_KEY = 'signalmap:radar:v1';
export const SIGNALMAP_RADAR_META_KEY = 'seed-meta:signalmap:radar';
export const DEFAULT_RADAR_POLL_MINUTES = 60;
export const DEFAULT_RADAR_TTL_SECONDS = 60 * 60 * 2;

const DEFAULT_RADAR_OUTAGES_URL =
  'https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=1d&limit=25';
const USER_AGENT = 'SignalMapCollector/1.0 (+https://signalmap.local)';

export interface CloudflareRadarResult {
  fetchedAt: string;
  pollMinutes: number;
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
  data: {
    fetchedAt: string;
    pollMinutes: number;
    events: SignalMapEvent[];
    sourceHealth: SignalMapSourceHealth[];
  };
  meta: {
    fetchedAt: number;
    recordCount: number;
    sourceVersion: string;
    pollMinutes: number;
  };
}

interface CollectOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: string;
  pollMinutes?: number;
  outagesUrl?: string;
}

interface WriteOptions {
  env?: Record<string, string | undefined>;
  ttlSeconds?: number;
  metaTtlSeconds?: number;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function oneLineSnippet(value: string, maxChars: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function sourceHealth(
  status: SignalMapSourceHealth['status'],
  fetchedAtMs: number,
  eventCount: number,
  detail: string,
): SignalMapSourceHealth {
  return {
    id: RADAR_SOURCE_ID,
    label: 'Cloudflare Radar',
    status,
    fetchedAt: fetchedAtMs,
    eventCount,
    detail,
  };
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<{ ok: true; payload: unknown } | { ok: false; detail: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const suffix = body ? `: ${oneLineSnippet(body, 200)}` : '';
      return { ok: false, detail: `HTTP ${response.status} from Cloudflare Radar${suffix}` };
    }
    return { ok: true, payload: await response.json() };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function buildResult(input: {
  fetchedAt: string;
  pollMinutes: number;
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
}): CloudflareRadarResult {
  const fetchedAtMs = Date.parse(input.fetchedAt);
  const data = {
    fetchedAt: input.fetchedAt,
    pollMinutes: input.pollMinutes,
    events: input.events,
    sourceHealth: input.sourceHealth,
  };
  return {
    fetchedAt: input.fetchedAt,
    pollMinutes: input.pollMinutes,
    events: input.events,
    sourceHealth: input.sourceHealth,
    data,
    meta: {
      fetchedAt: fetchedAtMs,
      recordCount: input.events.length,
      sourceVersion: 'signalmap-cloudflare-radar-collector-v1',
      pollMinutes: input.pollMinutes,
    },
  };
}

export async function collectSignalMapCloudflareRadar(
  options: CollectOptions = {},
): Promise<CloudflareRadarResult> {
  const env = options.env ?? process.env;
  const enabled = env['SIGNALMAP_RADAR_ENABLED'] !== '0';
  const pollMinutes = parsePositiveInteger(
    options.pollMinutes ?? env['SIGNALMAP_RADAR_POLL_MINUTES'] ?? env['SIGNALMAP_RSS_POLL_MINUTES'],
    DEFAULT_RADAR_POLL_MINUTES,
  );
  const fetchedAt = options.now ?? new Date().toISOString();
  const fetchedAtMs = Date.parse(fetchedAt);

  if (!enabled) {
    return buildResult({
      fetchedAt,
      pollMinutes,
      events: [],
      sourceHealth: [
        sourceHealth('unavailable', fetchedAtMs, 0, 'Cloudflare Radar collector disabled.'),
      ],
    });
  }

  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const token = cleanString(env['CLOUDFLARE_API_TOKEN']);
  const outagesUrl =
    cleanString(options.outagesUrl) ??
    cleanString(env['CLOUDFLARE_RADAR_OUTAGES_URL']) ??
    DEFAULT_RADAR_OUTAGES_URL;
  const outages = await fetchJson(outagesUrl, fetchImpl, token);

  if (!outages.ok) {
    return buildResult({
      fetchedAt,
      pollMinutes,
      events: [],
      sourceHealth: [
        sourceHealth('unavailable', fetchedAtMs, 0, outages.detail),
      ],
    });
  }

  const normalized = normalizeCloudflareRadar({
    outagesPayload: outages.payload,
    fetchedAt: fetchedAtMs,
  });

  return buildResult({
    fetchedAt,
    pollMinutes,
    events: normalized.events,
    sourceHealth: normalized.sourceHealth,
  });
}

export async function writeSignalMapCloudflareRadar(
  redis: Pick<RedisAdapter, 'setJsonEx'>,
  result: CloudflareRadarResult,
  options: WriteOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const ttlSeconds = parsePositiveInteger(
    options.ttlSeconds ?? env['SIGNALMAP_RADAR_TTL_SECONDS'],
    DEFAULT_RADAR_TTL_SECONDS,
  );
  const metaTtlSeconds = parsePositiveInteger(
    options.metaTtlSeconds ?? env['SIGNALMAP_RADAR_META_TTL_SECONDS'],
    ttlSeconds,
  );
  await redis.setJsonEx(SIGNALMAP_RADAR_CACHE_KEY, result.data, ttlSeconds);
  await redis.setJsonEx(SIGNALMAP_RADAR_META_KEY, result.meta, metaTtlSeconds);
}

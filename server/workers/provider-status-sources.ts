import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type {
  SignalMapEvent,
  SignalMapLocation,
  SignalMapSourceHealth,
} from '../../src/generated/server/worldmonitor/signalmap/v1/service_server.ts';
import type { RedisAdapter } from '../../src/server/lib/redis.types.ts';

export const SIGNALMAP_PROVIDER_CACHE_KEY = 'signalmap:providers:v1';
export const SIGNALMAP_PROVIDER_META_KEY = 'seed-meta:signalmap:providers';
export const DEFAULT_PROVIDER_STATUS_POLL_MINUTES = 60;
export const DEFAULT_PROVIDER_STATUS_TTL_SECONDS = 60 * 60 * 2;
export const DEFAULT_PROVIDER_STATUS_EVENT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const RSS_ACCEPT_HEADER = 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';
const JSON_ACCEPT_HEADER = 'application/json, */*;q=0.5';
const HTML_ACCEPT_HEADER = 'text/html, */*;q=0.5';
const USER_AGENT = 'SignalMapCollector/1.0 (+https://signalmap.local)';

type SourceKind = 'statuspage' | 'rss' | 'healthcheck';

export interface ProviderStatusSource {
  id: string;
  label: string;
  provider?: string;
  kind: SourceKind;
  url: string;
  displayUrl?: string;
  tier?: number;
  verified?: boolean;
}

export interface ProviderStatusResult {
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
  sources?: readonly ProviderStatusSource[];
  pollMinutes?: number;
}

interface WriteOptions {
  env?: Record<string, string | undefined>;
  ttlSeconds?: number;
  metaTtlSeconds?: number;
}

interface RssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  updated?: unknown;
  guid?: string | { '#text'?: string };
  description?: unknown;
  summary?: unknown;
}

const RSS_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

export const DEFAULT_PROVIDER_STATUS_SOURCES: readonly ProviderStatusSource[] = Object.freeze([
  {
    id: 'cloudflare-status',
    label: 'Cloudflare Status',
    provider: 'cloudflare',
    kind: 'statuspage',
    url: 'https://www.cloudflarestatus.com/api/v2/summary.json',
    displayUrl: 'https://www.cloudflarestatus.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'openai-status',
    label: 'OpenAI Status',
    provider: 'openai',
    kind: 'statuspage',
    url: 'https://status.openai.com/api/v2/summary.json',
    displayUrl: 'https://status.openai.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'anthropic-status',
    label: 'Anthropic Status',
    provider: 'anthropic',
    kind: 'statuspage',
    url: 'https://status.claude.com/api/v2/summary.json',
    displayUrl: 'https://status.claude.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'azure-status',
    label: 'Azure Status RSS',
    provider: 'azure',
    kind: 'rss',
    url: 'https://azurestatuscdn.azureedge.net/en-us/status/feed/',
    displayUrl: 'https://status.azure.com/en-us/status/',
    tier: 1,
    verified: true,
  },
  {
    id: 'okta-status',
    label: 'Okta Status RSS',
    provider: 'okta',
    kind: 'rss',
    url: 'https://feeds.feedburner.com/OktaStatusRSS',
    displayUrl: 'https://status.okta.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'aws-lambda-use1',
    label: 'AWS Lambda us-east-1',
    provider: 'aws',
    kind: 'rss',
    url: 'https://status.aws.amazon.com/rss/lambda-us-east-1.rss',
    tier: 1,
    verified: true,
  },
  {
    id: 'aws-lambda-use2',
    label: 'AWS Lambda us-east-2',
    provider: 'aws',
    kind: 'rss',
    url: 'https://status.aws.amazon.com/rss/lambda-us-east-2.rss',
    tier: 1,
    verified: true,
  },
  {
    id: 'aws-rds-use1',
    label: 'AWS RDS us-east-1',
    provider: 'aws',
    kind: 'rss',
    url: 'https://status.aws.amazon.com/rss/rds-us-east-1.rss',
    tier: 1,
    verified: true,
  },
  {
    id: 'aws-s3-use1',
    label: 'AWS S3 us-east-1',
    provider: 'aws',
    kind: 'rss',
    url: 'https://status.aws.amazon.com/rss/s3-us-standard.rss',
    displayUrl: 'https://status.aws.amazon.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'wasabi-status',
    label: 'Wasabi Status',
    provider: 'wasabi',
    kind: 'rss',
    url: 'https://status.wasabi.com/history.rss',
    displayUrl: 'https://status.wasabi.com/',
    tier: 1,
    verified: true,
  },
  {
    id: 'gdelt',
    label: 'GDELT GKG Index',
    kind: 'healthcheck',
    url: 'http://data.gdeltproject.org/gkg/index.html',
    tier: 2,
    verified: true,
  },
]);

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function isoFromMs(value: number | undefined): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

function toEpochMs(value: unknown): number | undefined {
  if (value == null || value === '' || value === 0) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function formatToken(value: unknown): string | undefined {
  const token = normalizeToken(value);
  if (!token) return undefined;
  return token
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(cleanString).filter((value): value is string => Boolean(value)))];
}

function weakProviderLocation(label: string): SignalMapLocation {
  return {
    name: label,
    scope: 'provider',
    confidence: 0.45,
    evidence: 'Provider-wide status source without specific geography',
  };
}

// Cloudflare Status events title-prefix with IATA (e.g. "SYD (Sydney) on 2026-05-04").
// Map the most-trafficked Cloudflare datacenter IATAs to coords so those
// events render as map markers instead of falling back to provider-anchor.
const CLOUDFLARE_IATA_LOCATIONS: Record<string, { name: string; countryIso2: string; lat: number; lon: number }> = {
  // Asia-Pacific
  SYD: { name: 'Sydney', countryIso2: 'AU', lat: -33.8688, lon: 151.2093 },
  MEL: { name: 'Melbourne', countryIso2: 'AU', lat: -37.8136, lon: 144.9631 },
  AKL: { name: 'Auckland', countryIso2: 'NZ', lat: -36.8485, lon: 174.7633 },
  NRT: { name: 'Tokyo', countryIso2: 'JP', lat: 35.7720, lon: 140.3929 },
  KIX: { name: 'Osaka', countryIso2: 'JP', lat: 34.4347, lon: 135.2440 },
  ICN: { name: 'Seoul', countryIso2: 'KR', lat: 37.4602, lon: 126.4407 },
  HKG: { name: 'Hong Kong', countryIso2: 'HK', lat: 22.3080, lon: 113.9185 },
  TPE: { name: 'Taipei', countryIso2: 'TW', lat: 25.0777, lon: 121.2328 },
  SIN: { name: 'Singapore', countryIso2: 'SG', lat: 1.3644, lon: 103.9915 },
  KUL: { name: 'Kuala Lumpur', countryIso2: 'MY', lat: 2.7456, lon: 101.7099 },
  BKK: { name: 'Bangkok', countryIso2: 'TH', lat: 13.6900, lon: 100.7501 },
  CGK: { name: 'Jakarta', countryIso2: 'ID', lat: -6.1256, lon: 106.6559 },
  MNL: { name: 'Manila', countryIso2: 'PH', lat: 14.5086, lon: 121.0194 },
  SGN: { name: 'Ho Chi Minh City', countryIso2: 'VN', lat: 10.8189, lon: 106.6519 },
  HAN: { name: 'Hanoi', countryIso2: 'VN', lat: 21.2187, lon: 105.8042 },
  // South Asia
  BOM: { name: 'Mumbai', countryIso2: 'IN', lat: 19.0760, lon: 72.8777 },
  DEL: { name: 'New Delhi', countryIso2: 'IN', lat: 28.5562, lon: 77.1000 },
  MAA: { name: 'Chennai', countryIso2: 'IN', lat: 12.9941, lon: 80.1709 },
  BLR: { name: 'Bangalore', countryIso2: 'IN', lat: 13.1986, lon: 77.7066 },
  CCU: { name: 'Kolkata', countryIso2: 'IN', lat: 22.6520, lon: 88.4463 },
  KHI: { name: 'Karachi', countryIso2: 'PK', lat: 24.9008, lon: 67.1681 },
  CMB: { name: 'Colombo', countryIso2: 'LK', lat: 7.1808, lon: 79.8841 },
  // Middle East / Africa
  DXB: { name: 'Dubai', countryIso2: 'AE', lat: 25.2532, lon: 55.3657 },
  DOH: { name: 'Doha', countryIso2: 'QA', lat: 25.2731, lon: 51.6086 },
  TLV: { name: 'Tel Aviv', countryIso2: 'IL', lat: 32.0114, lon: 34.8867 },
  CAI: { name: 'Cairo', countryIso2: 'EG', lat: 30.1219, lon: 31.4056 },
  JNB: { name: 'Johannesburg', countryIso2: 'ZA', lat: -26.1392, lon: 28.2460 },
  CPT: { name: 'Cape Town', countryIso2: 'ZA', lat: -33.9690, lon: 18.5970 },
  LOS: { name: 'Lagos', countryIso2: 'NG', lat: 6.5774, lon: 3.3211 },
  NBO: { name: 'Nairobi', countryIso2: 'KE', lat: -1.3192, lon: 36.9278 },
  // Europe
  LHR: { name: 'London', countryIso2: 'GB', lat: 51.4700, lon: -0.4543 },
  LCY: { name: 'London City', countryIso2: 'GB', lat: 51.5050, lon: 0.0556 },
  MAN: { name: 'Manchester', countryIso2: 'GB', lat: 53.3537, lon: -2.2750 },
  EDI: { name: 'Edinburgh', countryIso2: 'GB', lat: 55.9500, lon: -3.3725 },
  DUB: { name: 'Dublin', countryIso2: 'IE', lat: 53.4213, lon: -6.2700 },
  CDG: { name: 'Paris', countryIso2: 'FR', lat: 49.0097, lon: 2.5479 },
  AMS: { name: 'Amsterdam', countryIso2: 'NL', lat: 52.3105, lon: 4.7683 },
  FRA: { name: 'Frankfurt', countryIso2: 'DE', lat: 50.0379, lon: 8.5622 },
  MUC: { name: 'Munich', countryIso2: 'DE', lat: 48.3537, lon: 11.7860 },
  BER: { name: 'Berlin', countryIso2: 'DE', lat: 52.5200, lon: 13.4050 },
  ZRH: { name: 'Zurich', countryIso2: 'CH', lat: 47.4647, lon: 8.5492 },
  VIE: { name: 'Vienna', countryIso2: 'AT', lat: 48.1102, lon: 16.5697 },
  WAW: { name: 'Warsaw', countryIso2: 'PL', lat: 52.1657, lon: 20.9671 },
  PRG: { name: 'Prague', countryIso2: 'CZ', lat: 50.1008, lon: 14.2632 },
  CPH: { name: 'Copenhagen', countryIso2: 'DK', lat: 55.6180, lon: 12.6560 },
  ARN: { name: 'Stockholm', countryIso2: 'SE', lat: 59.6498, lon: 17.9237 },
  HEL: { name: 'Helsinki', countryIso2: 'FI', lat: 60.3172, lon: 24.9633 },
  OSL: { name: 'Oslo', countryIso2: 'NO', lat: 60.1939, lon: 11.1004 },
  MAD: { name: 'Madrid', countryIso2: 'ES', lat: 40.4936, lon: -3.5668 },
  BCN: { name: 'Barcelona', countryIso2: 'ES', lat: 41.2974, lon: 2.0833 },
  LIS: { name: 'Lisbon', countryIso2: 'PT', lat: 38.7813, lon: -9.1359 },
  MXP: { name: 'Milan', countryIso2: 'IT', lat: 45.6306, lon: 8.7281 },
  FCO: { name: 'Rome', countryIso2: 'IT', lat: 41.8003, lon: 12.2389 },
  IST: { name: 'Istanbul', countryIso2: 'TR', lat: 41.2753, lon: 28.7519 },
  ATH: { name: 'Athens', countryIso2: 'GR', lat: 37.9364, lon: 23.9445 },
  // North America
  LAX: { name: 'Los Angeles', countryIso2: 'US', lat: 33.9416, lon: -118.4085 },
  SFO: { name: 'San Francisco', countryIso2: 'US', lat: 37.6213, lon: -122.3790 },
  SJC: { name: 'San Jose', countryIso2: 'US', lat: 37.3639, lon: -121.9289 },
  SEA: { name: 'Seattle', countryIso2: 'US', lat: 47.4502, lon: -122.3088 },
  PDX: { name: 'Portland', countryIso2: 'US', lat: 45.5887, lon: -122.5975 },
  DEN: { name: 'Denver', countryIso2: 'US', lat: 39.8561, lon: -104.6737 },
  PHX: { name: 'Phoenix', countryIso2: 'US', lat: 33.4342, lon: -112.0117 },
  ORD: { name: 'Chicago', countryIso2: 'US', lat: 41.9742, lon: -87.9073 },
  MSP: { name: 'Minneapolis', countryIso2: 'US', lat: 44.8848, lon: -93.2223 },
  DFW: { name: 'Dallas', countryIso2: 'US', lat: 32.8998, lon: -97.0403 },
  IAH: { name: 'Houston', countryIso2: 'US', lat: 29.9902, lon: -95.3368 },
  ATL: { name: 'Atlanta', countryIso2: 'US', lat: 33.6407, lon: -84.4277 },
  MIA: { name: 'Miami', countryIso2: 'US', lat: 25.7959, lon: -80.2871 },
  TPA: { name: 'Tampa', countryIso2: 'US', lat: 27.9755, lon: -82.5332 },
  IAD: { name: 'Washington', countryIso2: 'US', lat: 38.9531, lon: -77.4565 },
  DCA: { name: 'Washington', countryIso2: 'US', lat: 38.8521, lon: -77.0377 },
  PHL: { name: 'Philadelphia', countryIso2: 'US', lat: 39.8744, lon: -75.2424 },
  EWR: { name: 'Newark', countryIso2: 'US', lat: 40.6895, lon: -74.1745 },
  JFK: { name: 'New York', countryIso2: 'US', lat: 40.6413, lon: -73.7781 },
  BOS: { name: 'Boston', countryIso2: 'US', lat: 42.3656, lon: -71.0096 },
  YYZ: { name: 'Toronto', countryIso2: 'CA', lat: 43.6777, lon: -79.6248 },
  YUL: { name: 'Montreal', countryIso2: 'CA', lat: 45.4706, lon: -73.7408 },
  YVR: { name: 'Vancouver', countryIso2: 'CA', lat: 49.1967, lon: -123.1815 },
  // Latin America
  MEX: { name: 'Mexico City', countryIso2: 'MX', lat: 19.4361, lon: -99.0719 },
  GRU: { name: 'São Paulo', countryIso2: 'BR', lat: -23.4356, lon: -46.4731 },
  GIG: { name: 'Rio de Janeiro', countryIso2: 'BR', lat: -22.8099, lon: -43.2506 },
  EZE: { name: 'Buenos Aires', countryIso2: 'AR', lat: -34.8222, lon: -58.5358 },
  SCL: { name: 'Santiago', countryIso2: 'CL', lat: -33.3930, lon: -70.7858 },
  BOG: { name: 'Bogotá', countryIso2: 'CO', lat: 4.7016, lon: -74.1469 },
  LIM: { name: 'Lima', countryIso2: 'PE', lat: -12.0219, lon: -77.1143 },
};
const CLOUDFLARE_IATA_REGEX = /\b([A-Z]{3})\b\s*\(/;

function cloudflareLocationFromTitle(title: string | undefined | null): SignalMapLocation | null {
  if (!title) return null;
  const match = CLOUDFLARE_IATA_REGEX.exec(title);
  if (!match) return null;
  const iata = match[1];
  if (!iata) return null;
  const entry = CLOUDFLARE_IATA_LOCATIONS[iata];
  if (!entry) return null;
  return {
    name: `${entry.name} (${iata})`,
    countryIso2: entry.countryIso2,
    lat: entry.lat,
    lon: entry.lon,
    scope: 'city',
    confidence: 0.78,
    evidence: `Cloudflare datacenter ${iata} (${entry.name})`,
  };
}

function providerAnchorLocation(source: ProviderStatusSource, title?: string): SignalMapLocation {
  // Cloudflare Status events embed an IATA code in the title (e.g.
  // "SYD (Sydney) on 2026-05-04"). Use it to pin events to specific
  // datacenter coords instead of a single Cloudflare-anchor marker.
  if (source.provider === 'cloudflare') {
    const iataLoc = cloudflareLocationFromTitle(title);
    if (iataLoc) return iataLoc;
    // No IATA in title — fall back to Cloudflare HQ in San Francisco.
    return {
      name: 'Cloudflare Status',
      countryIso2: 'US',
      lat: 37.7749,
      lon: -122.4194,
      scope: 'provider',
      confidence: 0.6,
      evidence: 'Cloudflare-wide status source; no datacenter IATA in title',
    };
  }

  if (source.id === 'aws-lambda-use1') {
    return {
      name: 'AWS Lambda us-east-1',
      countryIso2: 'US',
      lat: 39.0438,
      lon: -77.4874,
      scope: 'region',
      confidence: 0.76,
      evidence: 'AWS us-east-1 provider region marker',
    };
  }

  if (source.provider === 'openai') {
    return {
      name: 'OpenAI Status',
      countryIso2: 'US',
      lat: 37.7749,
      lon: -122.4194,
      scope: 'provider',
      confidence: 0.72,
      evidence: 'Provider-wide status source; marker uses public provider anchor.',
    };
  }

  if (source.provider === 'anthropic') {
    return {
      name: 'Anthropic Status',
      countryIso2: 'US',
      lat: 37.7749,
      lon: -122.4194,
      scope: 'provider',
      confidence: 0.72,
      evidence: 'Provider-wide status source; marker uses public provider anchor.',
    };
  }

  if (source.provider === 'wasabi') {
    return {
      name: 'Wasabi Status',
      countryIso2: 'US',
      lat: 42.3601,
      lon: -71.0589,
      scope: 'provider',
      confidence: 0.72,
      evidence: 'Provider-wide status source; marker uses public provider anchor.',
    };
  }

  return weakProviderLocation(source.label);
}

function hasUsableGeography(location: SignalMapLocation): boolean {
  return location.lat != null && location.lon != null && location.confidence >= 0.7;
}

function severityFromImpact(impact: unknown): SignalMapEvent['severity'] {
  const token = normalizeToken(impact);
  if (token === 'critical' || token === 'major_outage') return 'critical';
  if (token === 'major' || token === 'partial_outage') return 'high';
  if (token === 'minor' || token === 'degraded_performance' || token === 'maintenance') return 'medium';
  if (token === 'none' || token === 'operational') return 'info';
  return 'medium';
}

function isResolvedStatus(status: unknown): boolean {
  const token = normalizeToken(status);
  return token === 'resolved' || token === 'completed' || token === 'postmortem';
}

function isOperationalStatus(status: unknown): boolean {
  const token = normalizeToken(status);
  return !token || token === 'operational' || token === 'none';
}

function eventId(source: ProviderStatusSource, basis: string, timestampMs: number | undefined): string {
  return `provider-status-${source.id}-${hashValue(`${source.id}:${basis}:${timestampMs ?? ''}`)}`;
}

function providerEvent(input: {
  source: ProviderStatusSource;
  basis: string;
  title: string;
  summary: string;
  impact?: unknown;
  status?: unknown;
  sourceUrl?: string;
  startedMs?: number;
  observedMs?: number;
  fetchedAtMs: number;
}): SignalMapEvent {
  const location = providerAnchorLocation(input.source, input.title);
  const observedAt = input.observedMs ?? input.startedMs ?? input.fetchedAtMs;
  return {
    id: eventId(input.source, input.basis, input.startedMs),
    category: 'provider',
    severity: severityFromImpact(input.impact ?? input.status),
    title: input.title,
    summary: input.summary,
    tags: compactStrings(['provider-status', input.source.provider, input.source.id, formatToken(input.status)]),
    startedAt: isoFromMs(input.startedMs),
    lastObservedAt: isoFromMs(observedAt) ?? new Date(input.fetchedAtMs).toISOString(),
    locations: [location],
    sources: [
      {
        id: input.source.id,
        label: input.source.label,
        url: input.sourceUrl ?? input.source.displayUrl ?? input.source.url,
        tier: input.source.tier ?? 1,
        verified: input.source.verified !== false,
        fetchedAt: new Date(input.fetchedAtMs).toISOString(),
      },
    ],
    confidence: 0.6,
    provider: input.source.provider,
    kind: 'provider_status',
    watchlistMatch: false,
    markerEligible: hasUsableGeography(location),
  };
}

function statuspageEvents(payload: unknown, source: ProviderStatusSource, fetchedAtMs: number): SignalMapEvent[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const incidents = Array.isArray(record['incidents']) ? record['incidents'] : [];
  const maintenances = Array.isArray(record['scheduled_maintenances'])
    ? record['scheduled_maintenances']
    : [];
  const events: SignalMapEvent[] = [];

  for (const raw of [...incidents, ...maintenances]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (isResolvedStatus(item['status']) || isOperationalStatus(item['status'])) continue;

    const title = cleanString(item['name']) ?? `${source.label} incident`;
    const status = formatToken(item['status']);
    const summary = status ? `${title} (${status}).` : title;
    const startedMs = toEpochMs(item['created_at'] ?? item['scheduled_for']);
    const observedMs = toEpochMs(item['updated_at'] ?? item['scheduled_until']);
    events.push(providerEvent({
      source,
      basis: cleanString(item['id']) ?? title,
      title,
      summary,
      impact: item['impact'],
      status: item['status'],
      sourceUrl: cleanString(item['shortlink']) ?? source.displayUrl ?? source.url,
      startedMs,
      observedMs,
      fetchedAtMs,
    }));
  }

  return events;
}

function stripHtml(value: unknown): string | undefined {
  const text = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

function rssItems(xml: string): RssItem[] {
  try {
    const parsed = RSS_PARSER.parse(xml);
    const channel = parsed?.rss?.channel;
    const rawItems = channel?.item ?? parsed?.feed?.entry;
    if (!rawItems) return [];
    return (Array.isArray(rawItems) ? rawItems : [rawItems])
      .filter((item): item is RssItem => item && typeof item === 'object' && !Array.isArray(item));
  } catch {
    return [];
  }
}

function guidText(guid: RssItem['guid']): string | undefined {
  if (typeof guid === 'string') return cleanString(guid);
  return cleanString(guid?.['#text']);
}

function isActiveRssItem(item: RssItem): boolean {
  const text = `${item.title ?? ''} ${item.description ?? ''} ${item.summary ?? ''}`.toLowerCase();
  if (/\b(resolved|recovered|completed|closed|restored|postmortem)\b/.test(text)) return false;
  return /\b(degradation|degraded|outage|incident|disruption|maintenance|advisory|elevated|error|availability)\b/.test(text);
}

function rssEvents(xml: string, source: ProviderStatusSource, fetchedAtMs: number): SignalMapEvent[] {
  const cutoffMs = fetchedAtMs - DEFAULT_PROVIDER_STATUS_EVENT_LOOKBACK_MS;
  return rssItems(xml)
    .filter(isActiveRssItem)
    .filter((item) => {
      const itemMs = toEpochMs(item.pubDate ?? item.updated);
      return itemMs == null || itemMs >= cutoffMs;
    })
    .map((item) => {
      const title = cleanString(item.title) ?? `${source.label} event`;
      const description = stripHtml(item.description ?? item.summary);
      const startedMs = toEpochMs(item.pubDate ?? item.updated);
      return providerEvent({
        source,
        basis: guidText(item.guid) ?? cleanString(item.link) ?? title,
        title,
        summary: description ?? title,
        impact: /\b(outage|disruption)\b/i.test(`${title} ${description ?? ''}`) ? 'major' : 'minor',
        status: 'incident',
        sourceUrl: cleanString(item.link) ?? source.displayUrl ?? source.url,
        startedMs,
        fetchedAtMs,
      });
    });
}

function sourceHealthFor(
  source: ProviderStatusSource,
  status: SignalMapSourceHealth['status'],
  fetchedAtMs: number,
  eventCount: number,
  detail: string,
): SignalMapSourceHealth {
  return {
    id: `provider-status:${source.id}`,
    label: source.label,
    status,
    fetchedAt: fetchedAtMs,
    eventCount,
    detail,
  };
}

async function collectSource(
  source: ProviderStatusSource,
  fetchImpl: typeof fetch,
  fetchedAtMs: number,
): Promise<{ events: SignalMapEvent[]; health: SignalMapSourceHealth }> {
  const accept = source.kind === 'statuspage'
    ? JSON_ACCEPT_HEADER
    : source.kind === 'rss' ? RSS_ACCEPT_HEADER : HTML_ACCEPT_HEADER;

  try {
    const response = await fetchImpl(source.url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
      },
    });
    if (!response.ok) {
      return {
        events: [],
        health: sourceHealthFor(source, 'unavailable', fetchedAtMs, 0, `HTTP ${response.status} from ${source.url}.`),
      };
    }

    if (source.kind === 'statuspage') {
      const payload = await response.json();
      const events = statuspageEvents(payload, source, fetchedAtMs);
      return {
        events,
        health: sourceHealthFor(source, 'ok', fetchedAtMs, events.length, `Fetched ${source.url}.`),
      };
    }

    if (source.kind === 'rss') {
      const xml = await response.text();
      const events = rssEvents(xml, source, fetchedAtMs);
      return {
        events,
        health: sourceHealthFor(source, 'ok', fetchedAtMs, events.length, `Fetched ${source.url}.`),
      };
    }

    await response.text();
    return {
      events: [],
      health: sourceHealthFor(source, 'ok', fetchedAtMs, 0, `Fetched ${source.url}.`),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      events: [],
      health: sourceHealthFor(source, 'unavailable', fetchedAtMs, 0, message),
    };
  }
}

export async function collectSignalMapProviderStatuses(
  options: CollectOptions = {},
): Promise<ProviderStatusResult> {
  const env = options.env ?? process.env;
  const enabled = env['SIGNALMAP_PROVIDER_STATUS_ENABLED'] !== '0';
  const pollMinutes = parsePositiveInteger(
    options.pollMinutes ?? env['SIGNALMAP_PROVIDER_STATUS_POLL_MINUTES'] ?? env['SIGNALMAP_RSS_POLL_MINUTES'],
    DEFAULT_PROVIDER_STATUS_POLL_MINUTES,
  );
  const fetchedAt = options.now ?? new Date().toISOString();
  const fetchedAtMs = Date.parse(fetchedAt);
  const sources = enabled ? (options.sources ?? DEFAULT_PROVIDER_STATUS_SOURCES) : [];
  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const events: SignalMapEvent[] = [];
  const sourceHealth: SignalMapSourceHealth[] = [];

  for (const source of sources) {
    const result = await collectSource(source, fetchImpl, fetchedAtMs);
    events.push(...result.events);
    sourceHealth.push(result.health);
  }

  const data = {
    fetchedAt,
    pollMinutes,
    events,
    sourceHealth,
  };
  const meta = {
    fetchedAt: fetchedAtMs,
    recordCount: events.length,
    sourceVersion: 'signalmap-provider-status-collector-v1',
    pollMinutes,
  };

  return {
    fetchedAt,
    pollMinutes,
    events,
    sourceHealth,
    data,
    meta,
  };
}

export async function writeSignalMapProviderStatuses(
  redis: Pick<RedisAdapter, 'setJsonEx'>,
  result: ProviderStatusResult,
  options: WriteOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const ttlSeconds = parsePositiveInteger(
    options.ttlSeconds ?? env['SIGNALMAP_PROVIDER_STATUS_TTL_SECONDS'],
    DEFAULT_PROVIDER_STATUS_TTL_SECONDS,
  );
  const metaTtlSeconds = parsePositiveInteger(
    options.metaTtlSeconds ?? env['SIGNALMAP_PROVIDER_STATUS_META_TTL_SECONDS'],
    ttlSeconds,
  );
  await redis.setJsonEx(SIGNALMAP_PROVIDER_CACHE_KEY, result.data, ttlSeconds);
  await redis.setJsonEx(SIGNALMAP_PROVIDER_META_KEY, result.meta, metaTtlSeconds);
}

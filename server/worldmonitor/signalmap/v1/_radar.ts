import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SignalMapEvent,
  SignalMapLocation,
  SignalMapSource,
  SignalMapSourceHealth,
} from '../../../../src/generated/server/worldmonitor/signalmap/v1/service_server';

export const RADAR_OUTAGES_CACHE_KEY = 'infra:outages:v1';
export const RADAR_TRAFFIC_ANOMALIES_CACHE_KEY = 'cf:radar:traffic-anomalies:v1';
export const RADAR_SOURCE_ID = 'cloudflare-radar';

const RADAR_SOURCE_LABEL = 'Cloudflare Radar';
const PROVIDER = 'cloudflare';

// Country centroids derived from scripts/shared/country-bboxes.json. The bbox
// file ships ~250 countries as [minLat, minLon, maxLat, maxLon]; we compute
// the geographic midpoint at module init for O(1) lookup. Previously this
// table was hardcoded to 5 countries (FR/US/GB/DE/JP) which meant Cloudflare
// Radar events for any other country (Malaysia, Iran, Sudan, etc.) ended up
// without lat/lon and never rendered as map markers.
function loadCountryCentroids(): Record<string, readonly [number, number]> {
  // Walk up from this file (server/worldmonitor/signalmap/v1/_radar.ts) to
  // the repo root, then into scripts/shared/country-bboxes.json. tsx runs
  // this file directly so __dirname-equivalent works via import.meta.url.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../../../scripts/shared/country-bboxes.json'),
    resolve(here, '../../../../../scripts/shared/country-bboxes.json'),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, [number, number, number, number]>;
      const out: Record<string, readonly [number, number]> = {};
      for (const [iso2, bbox] of Object.entries(parsed)) {
        if (!Array.isArray(bbox) || bbox.length !== 4) continue;
        const [minLat, minLon, maxLat, maxLon] = bbox;
        if (![minLat, minLon, maxLat, maxLon].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
        out[iso2] = [(minLat + maxLat) / 2, (minLon + maxLon) / 2] as const;
      }
      return out;
    } catch {
      // try next candidate
    }
  }
  // Fallback: minimal seed list so something works even if the bbox file
  // can't be located (e.g. running outside the docker image).
  return {
    FR: [46.23, 2.21],
    US: [37.09, -95.71],
    GB: [55.38, -3.44],
    DE: [51.17, 10.45],
    JP: [36.2, 138.25],
  };
}

const COUNTRY_CENTROIDS: Record<string, readonly [number, number]> = loadCountryCentroids();

// AWS region code → datacenter coordinate. Cloudflare Radar / provider-status
// outage entries that target a specific cloud region (e.g. "AWS me-central-1")
// rarely come tagged with a country in the upstream API — only the region
// code appears in the description. Without this lookup, the resolver returns
// confidence 0.45 and the event drops off the map even though "me-central-1"
// is unambiguously UAE/Dubai. Source table: scripts/shared/aws-regions.json.
function loadAwsRegions(): Record<
  string,
  readonly [number, number, string, string]
> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../../../scripts/shared/aws-regions.json'),
    resolve(here, '../../../../../scripts/shared/aws-regions.json'),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, readonly [number, number, string, string]> = {};
      for (const [code, entry] of Object.entries(parsed)) {
        if (code.startsWith('_')) continue;
        if (!Array.isArray(entry) || entry.length < 4) continue;
        const [lat, lon, iso2, label] = entry as unknown[];
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        if (typeof iso2 !== 'string' || typeof label !== 'string') continue;
        out[code.toLowerCase()] = [lat, lon, iso2.toUpperCase(), label] as const;
      }
      return out;
    } catch {
      // try next candidate
    }
  }
  return {};
}

const AWS_REGIONS: Record<
  string,
  readonly [number, number, string, string]
> = loadAwsRegions();

// Matches AWS region codes embedded in free-text fields. Order alternation
// covers gov/cn variants without false-positives on unrelated tokens. Using
// alphanumeric-class lookarounds instead of `\b` because `_` counts as a
// word character in JS regex — `\b` failed to match
// "multipleservices-me-central-1_1777533954" since there's no word boundary
// between `1` and `_`.
const AWS_REGION_REGEX = /(?<![a-z0-9])((?:us-gov|us|eu|ap|ca|me|af|sa|il|mx|cn)-[a-z]+-\d+)(?![a-z0-9])/gi;

// Extract the first AWS region code mentioned in any of the candidate text
// blobs. Returns the lowercase region key or null. Lowercased so it joins
// to AWS_REGIONS without further normalization.
function extractAwsRegionCode(...texts: Array<string | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;
    AWS_REGION_REGEX.lastIndex = 0;
    const match = AWS_REGION_REGEX.exec(text);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

// Build a SignalMapLocation from an AWS region tag. Returns null when the
// code is unknown so callers can keep walking their fallback chain.
function awsRegionLocation(
  regionCode: string,
  evidence: string | undefined,
): SignalMapLocation | null {
  const entry = AWS_REGIONS[regionCode];
  if (!entry) return null;
  const [lat, lon, iso2, label] = entry;
  return {
    name: label,
    countryIso2: iso2,
    lat,
    lon,
    scope: 'region',
    confidence: 0.85,
    evidence: evidence ?? `AWS region ${regionCode}`,
  };
}

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  france: 'FR',
  'united states': 'US',
  'united kingdom': 'GB',
  germany: 'DE',
  japan: 'JP',
};

export interface SignalMapRadarInput {
  outagesPayload?: unknown;
  anomaliesPayload?: unknown;
  fetchedAt?: number;
}

export interface SignalMapRadarNormalizationResult {
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
}

interface OutageEntry {
  id?: string;
  title?: string;
  link?: string;
  linkedUrl?: string;
  description?: string;
  detectedAt?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  endedAt?: unknown;
  country?: string;
  region?: string;
  location?: { latitude?: unknown; longitude?: unknown };
  severity?: string;
  categories?: unknown;
  cause?: string;
  outageType?: string;
  scope?: string;
  locations?: unknown;
  locationsDetails?: unknown;
  outage?: { outageCause?: string; outageType?: string };
  asnsDetails?: unknown;
}

interface AnomalyEntry {
  uuid?: string;
  type?: string;
  status?: string;
  startDate?: unknown;
  endDate?: unknown;
  asn?: string | number;
  asnName?: string;
  asnDetails?: { asn?: string | number; name?: string };
  locationCode?: string;
  locationName?: string;
  latitude?: unknown;
  longitude?: unknown;
  locationDetails?: { code?: string; name?: string; latitude?: unknown; longitude?: unknown };
}

export function normalizeCloudflareRadar(input: SignalMapRadarInput): SignalMapRadarNormalizationResult {
  const hasOutagesPayload = input.outagesPayload != null;
  const hasAnomaliesPayload = input.anomaliesPayload != null;
  const events = [
    ...normalizeRadarOutages(input.outagesPayload, input.fetchedAt),
    ...normalizeRadarTrafficAnomalies(input.anomaliesPayload, input.fetchedAt),
  ];
  const healthFetchedAt = input.fetchedAt ?? fallbackFetchedAt(events);
  const activeCount = events.filter((event) => event.markerEligible).length;
  const status = hasOutagesPayload || hasAnomaliesPayload ? 'ok' : 'unavailable';
  const detail =
    status === 'unavailable'
      ? 'Cloudflare Radar payloads unavailable'
      : activeCount > 0
        ? `${activeCount} active Cloudflare Radar event${activeCount === 1 ? '' : 's'}`
        : 'Cloudflare Radar has no current events';

  return {
    events,
    sourceHealth: [
      {
        id: RADAR_SOURCE_ID,
        label: RADAR_SOURCE_LABEL,
        status,
        fetchedAt: healthFetchedAt,
        eventCount: events.length,
        detail,
      },
    ],
  };
}

export function normalizeRadarOutages(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
  return extractOutages(payload).map((entry) => outageToEvent(entry, fetchedAt));
}

export function normalizeRadarTrafficAnomalies(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
  return extractAnomalies(payload).map((entry) => anomalyToEvent(entry, fetchedAt));
}

function outageToEvent(entry: OutageEntry, fetchedAt?: number): SignalMapEvent {
  const startMs = toEpochMs(entry.detectedAt ?? entry.startDate);
  const endMs = toEpochMs(entry.endedAt ?? entry.endDate);
  const active = !endMs;
  const cause = entry.cause ?? entry.outage?.outageCause;
  const outageType = entry.outageType ?? entry.outage?.outageType ?? entry.scope;
  const location = outageLocation(entry);
  const source = radarSource(entry.link ?? entry.linkedUrl, fetchedAt, startMs);
  const title =
    entry.title ??
    `${formatEnum(outageType) || 'Internet'} outage${location.name ? ` in ${location.name}` : ''}`;
  const summaryParts = [entry.description, formatEnum(cause), formatEnum(outageType)].filter(Boolean);

  return {
    id: stableId('radar-outage', entry.id ?? title, startMs),
    category: 'internet',
    severity: outageSeverity(entry.severity, outageType),
    title,
    summary: summaryParts.join(' | ') || title,
    tags: compactStrings(['cloudflare-radar', cause, outageType, ...stringArray(entry.categories)]),
    startedAt: isoFromMs(startMs),
    endedAt: isoFromMs(endMs),
    lastObservedAt: isoFromMs(fetchedAt ?? endMs ?? startMs) ?? '1970-01-01T00:00:00.000Z',
    locations: [location],
    sources: [source],
    confidence: active ? 0.86 : 0.74,
    provider: PROVIDER,
    kind: 'radar_outage',
    watchlistMatch: false,
    markerEligible: active && hasUsableGeography(location),
  };
}

function anomalyToEvent(entry: AnomalyEntry, fetchedAt?: number): SignalMapEvent {
  const startMs = toEpochMs(entry.startDate);
  const endMs = toEpochMs(entry.endDate);
  const active = normalizeUpper(entry.status) === 'ACTIVE' && !endMs;
  const location = anomalyLocation(entry);
  const asn = entry.asn ?? entry.asnDetails?.asn;
  const asnName = entry.asnName ?? entry.asnDetails?.name;
  const type = normalizeUpper(entry.type) || 'TRAFFIC_ANOMALY';
  const subject = asnName ? `${asnName}${asn ? ` AS${asn}` : ''}` : asn ? `AS${asn}` : location.name;
  const title = `${formatEnum(type) || 'Traffic anomaly'}${subject ? ` affecting ${subject}` : ''}`;

  return {
    id: stableId('radar-anomaly', entry.uuid ?? `${type}-${subject}`, startMs),
    category: 'internet',
    severity: active && type === 'TRAFFIC_DROP' ? 'high' : active ? 'medium' : 'info',
    title,
    summary: `${formatEnum(type) || 'Traffic anomaly'} observed${subject ? ` for ${subject}` : ''}${
      location.name ? ` in ${location.name}` : ''
    }.`,
    tags: compactStrings(['cloudflare-radar', type, asn ? `AS${asn}` : undefined, asnName]),
    startedAt: isoFromMs(startMs),
    endedAt: isoFromMs(endMs),
    lastObservedAt: isoFromMs(fetchedAt ?? endMs ?? startMs) ?? '1970-01-01T00:00:00.000Z',
    locations: [location],
    sources: [radarSource(undefined, fetchedAt, startMs)],
    confidence: active ? 0.82 : 0.68,
    provider: PROVIDER,
    kind: 'radar_anomaly',
    watchlistMatch: false,
    markerEligible: active && hasUsableGeography(location),
  };
}

function extractOutages(payload: unknown): OutageEntry[] {
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.outages)) return payload.outages.filter(isRecord) as OutageEntry[];
  const result = payload.result;
  if (isRecord(result) && Array.isArray(result.annotations)) {
    return result.annotations.filter(isRecord) as OutageEntry[];
  }
  return [];
}

function extractAnomalies(payload: unknown): AnomalyEntry[] {
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.anomalies)) return payload.anomalies.filter(isRecord) as AnomalyEntry[];
  const result = payload.result;
  if (isRecord(result) && Array.isArray(result.trafficAnomalies)) {
    return result.trafficAnomalies.filter(isRecord) as AnomalyEntry[];
  }
  return [];
}

function outageLocation(entry: OutageEntry): SignalMapLocation {
  const detail = firstRecord(entry.locationsDetails);
  const country = cleanString(entry.country) ?? cleanString(detail?.name);
  const countryIso2 = upperString(detail?.code) ?? firstString(entry.locations) ?? iso2FromCountryName(country);
  const scopeValue = normalizeUpper(entry.outageType ?? entry.outage?.outageType ?? entry.scope);
  const centroid = countryIso2 ? COUNTRY_CENTROIDS[countryIso2] : undefined;
  const lat = toNumber(entry.location?.latitude) ?? centroid?.[0];
  const lon = toNumber(entry.location?.longitude) ?? centroid?.[1];
  const region = cleanString(entry.region);
  const locationName = country ?? countryIso2 ?? 'Unknown';

  // AWS region fallback: when the upstream entry has no country/locations
  // attached but a cloud region tag appears in any of its text fields —
  // including the source URL (e.g. health.aws.amazon.com/health/status
  // #multipleservices-me-central-1_...) — pin to that region's datacenter
  // city. Confidence 0.85 beats the 0.7 marker threshold so the event
  // renders on the map. Order: description first (most specific), then
  // region/title, then linked URLs (last because URLs may also embed
  // unrelated tags).
  if (!countryIso2 && (lat == null || lon == null)) {
    const awsRegion = extractAwsRegionCode(
      entry.description,
      region,
      entry.title,
      entry.link,
      entry.linkedUrl,
    );
    const awsLoc = awsRegion ? awsRegionLocation(awsRegion, cleanString(entry.description)) : null;
    if (awsLoc) return awsLoc;
  }

  return {
    name: region || locationName,
    countryIso2,
    lat,
    lon,
    scope: scopeValue === 'REGIONAL' ? 'region' : 'country',
    confidence: countryIso2 || (lat != null && lon != null) ? 0.84 : 0.45,
    evidence: cleanString(entry.description) ?? formatEnum(scopeValue) ?? undefined,
  };
}

function anomalyLocation(entry: AnomalyEntry): SignalMapLocation {
  const locationName = cleanString(entry.locationName) ?? cleanString(entry.locationDetails?.name);
  const countryIso2 = upperString(entry.locationCode) ?? upperString(entry.locationDetails?.code) ?? iso2FromCountryName(locationName);
  const name = cleanString(entry.locationName) ?? cleanString(entry.locationDetails?.name) ?? countryIso2 ?? 'Unknown';
  const centroid = countryIso2 ? COUNTRY_CENTROIDS[countryIso2] : undefined;
  const lat = toNumber(entry.latitude ?? entry.locationDetails?.latitude) ?? centroid?.[0];
  const lon = toNumber(entry.longitude ?? entry.locationDetails?.longitude) ?? centroid?.[1];
  const asn = entry.asn ?? entry.asnDetails?.asn;

  // AWS region fallback: same rationale as outageLocation. Some traffic
  // anomalies reference cloud regions in the asnName / type fields without
  // a country code attached.
  if (!countryIso2 && (lat == null || lon == null)) {
    const awsRegion = extractAwsRegionCode(
      entry.asnName ?? entry.asnDetails?.name,
      entry.type,
      locationName,
    );
    const awsLoc = awsRegion
      ? awsRegionLocation(awsRegion, entry.asnName ?? entry.asnDetails?.name ?? entry.type)
      : null;
    if (awsLoc) return awsLoc;
  }

  return {
    name,
    countryIso2,
    lat,
    lon,
    scope: asn ? 'network' : 'country',
    confidence: countryIso2 || (lat != null && lon != null) ? 0.82 : 0.45,
    evidence: compactStrings([entry.type, asn ? `AS${asn}` : undefined, entry.asnName ?? entry.asnDetails?.name]).join(' | '),
  };
}

function radarSource(url: string | undefined, fetchedAt: number | undefined, eventMs: number | undefined): SignalMapSource {
  return {
    id: RADAR_SOURCE_ID,
    label: RADAR_SOURCE_LABEL,
    url: cleanString(url),
    tier: 1,
    verified: true,
    fetchedAt: isoFromMs(fetchedAt ?? eventMs),
  };
}

function outageSeverity(severity: string | undefined, outageType: string | undefined): string {
  const severityKey = normalizeUpper(severity);
  const typeKey = normalizeUpper(outageType);
  if (severityKey === 'OUTAGE_SEVERITY_TOTAL' || typeKey === 'NATIONWIDE') return 'critical';
  if (severityKey === 'OUTAGE_SEVERITY_MAJOR' || typeKey === 'REGIONAL') return 'high';
  if (severityKey === 'OUTAGE_SEVERITY_PARTIAL') return 'medium';
  return 'info';
}

function fallbackFetchedAt(events: SignalMapEvent[]): number {
  for (const event of events) {
    const candidate = Date.parse(event.lastObservedAt || event.startedAt || event.endedAt || '');
    if (Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

function hasUsableGeography(location: SignalMapLocation): boolean {
  return location.lat != null && location.lon != null && location.confidence >= 0.7;
}

function stableId(prefix: string, value: string, ms: number | undefined): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${normalized || 'unknown'}${ms ? `-${ms}` : ''}`;
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

function isoFromMs(value: number | undefined): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(cleanString).filter((value): value is string => Boolean(value)))];
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function upperString(value: unknown): string | undefined {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.toUpperCase() : undefined;
}

function normalizeUpper(value: unknown): string | undefined {
  return upperString(value);
}

function formatEnum(value: unknown): string | undefined {
  const key = cleanString(value);
  if (!key) return undefined;
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function iso2FromCountryName(name: string | undefined): string | undefined {
  return name ? COUNTRY_NAME_TO_ISO2[name.toLowerCase()] : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find(isRecord) : undefined;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? upperString(value.find((item) => typeof item === 'string')) : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

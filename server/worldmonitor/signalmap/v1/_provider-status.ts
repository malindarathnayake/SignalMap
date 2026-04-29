import { XMLParser } from 'fast-xml-parser';
import type {
  SignalMapEvent,
  SignalMapLocation,
  SignalMapSource,
  SignalMapSourceHealth,
} from '../../../../src/generated/server/worldmonitor/signalmap/v1/service_server';

export const PROVIDER_STATUS_SOURCE_ID = 'provider-status';
export const PROVIDER_STATUS_CACHE_KEY = 'infra:service-statuses:v1';

const DEFAULT_ISO = '1970-01-01T00:00:00.000Z';
const PROVIDERS = ['cloudflare', 'okta', 'm365', 'azure', 'wasabi'] as const;

type Provider = (typeof PROVIDERS)[number];

export interface SignalMapProviderStatusInput {
  cloudflarePayload?: unknown;
  oktaPayload?: string;
  m365Payload?: string;
  azurePayload?: string;
  wasabiPayload?: string;
  fetchedAt?: number;
}

export interface SignalMapProviderStatusNormalizationResult {
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
}

interface StatuspageIncident {
  id?: string;
  name?: string;
  status?: string;
  impact?: string;
  created_at?: unknown;
  updated_at?: unknown;
  shortlink?: string;
}

interface StatuspageMaintenance {
  id?: string;
  name?: string;
  status?: string;
  impact?: string;
  scheduled_for?: unknown;
  scheduled_until?: unknown;
  shortlink?: string;
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string | { '#text'?: string };
  description?: string;
}

const RSS_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

const PROVIDER_LABELS: Record<Provider, string> = {
  cloudflare: 'Cloudflare Status',
  okta: 'Okta Trust Status',
  m365: 'Microsoft 365 Service Health',
  azure: 'Azure Status',
  wasabi: 'Wasabi Status',
};

const WASABI_REGIONS: Record<string, SignalMapLocation> = {
  'US-WEST-1': {
    name: 'US-WEST-1',
    countryIso2: 'US',
    lat: 37.25,
    lon: -119.75,
    scope: 'region',
    confidence: 0.78,
    evidence: 'Wasabi provider region',
  },
};

export function normalizeProviderStatuses(
  input: SignalMapProviderStatusInput,
): SignalMapProviderStatusNormalizationResult {
  const byProvider: Record<Provider, SignalMapEvent[]> = {
    cloudflare: input.cloudflarePayload == null ? [] : normalizeCloudflareStatus(input.cloudflarePayload, input.fetchedAt),
    okta: normalizeProviderStatusRss('okta', input.oktaPayload, input.fetchedAt),
    m365: normalizeProviderStatusRss('m365', input.m365Payload, input.fetchedAt),
    azure: normalizeProviderStatusRss('azure', input.azurePayload, input.fetchedAt),
    wasabi: normalizeProviderStatusRss('wasabi', input.wasabiPayload, input.fetchedAt),
  };
  const events = PROVIDERS.flatMap((provider) => byProvider[provider]);

  return {
    events,
    sourceHealth: PROVIDERS.map((provider) =>
      providerHealth(provider, payloadProvided(provider, input), byProvider[provider], input.fetchedAt),
    ),
  };
}

export function normalizeCloudflareStatus(payload: unknown, fetchedAt?: number): SignalMapEvent[] {
  if (!isRecord(payload)) return [];

  const incidents = (arrayOfRecords(payload.incidents) as StatuspageIncident[])
    .filter((incident) => !isResolvedStatus(incident.status))
    .filter((incident) => !isOperationalStatus(incident.status))
    .map((incident) => cloudflareIncidentToEvent(incident, fetchedAt));

  const maintenances = (arrayOfRecords(payload.scheduled_maintenances) as StatuspageMaintenance[])
    .filter((maintenance) => !isResolvedStatus(maintenance.status))
    .filter((maintenance) => !isOperationalStatus(maintenance.status))
    .map((maintenance) => cloudflareMaintenanceToEvent(maintenance, fetchedAt));

  return [...incidents, ...maintenances];
}

export function normalizeProviderStatusRss(
  provider: 'okta' | 'm365' | 'azure' | 'wasabi',
  xml: string | undefined,
  fetchedAt?: number,
): SignalMapEvent[] {
  if (!xml) return [];

  const items = extractRssItems(xml);
  return items
    .filter((item) => isActiveProviderItem(item))
    .map((item) => rssItemToEvent(provider, item, fetchedAt));
}

function cloudflareIncidentToEvent(incident: StatuspageIncident, fetchedAt?: number): SignalMapEvent {
  const startMs = toEpochMs(incident.created_at);
  const observedMs = toEpochMs(incident.updated_at);
  const title = cleanString(incident.name) ?? 'Cloudflare status incident';
  const location = cloudflareLocation(title);
  const severity = impactSeverity(incident.impact);

  return event({
    provider: 'cloudflare',
    idValue: cleanString(incident.id) ?? title,
    timestampMs: startMs,
    severity,
    title,
    summary: `${title}${incident.status ? ` (${formatToken(incident.status)})` : ''}.`,
    tags: compactStrings(['cloudflare-status', incident.status, incident.impact, ...geoTags(title)]),
    startedAt: isoFromMs(startMs),
    lastObservedAt: isoFromMs(fetchedAt ?? observedMs ?? startMs) ?? DEFAULT_ISO,
    locations: [location],
    sourceUrl: cleanString(incident.shortlink),
    fetchedAt,
    confidence: location.confidence >= 0.7 ? 0.82 : 0.62,
  });
}

function cloudflareMaintenanceToEvent(maintenance: StatuspageMaintenance, fetchedAt?: number): SignalMapEvent {
  const startMs = toEpochMs(maintenance.scheduled_for);
  const endMs = toEpochMs(maintenance.scheduled_until);
  const title = cleanString(maintenance.name) ?? 'Cloudflare scheduled maintenance';
  const location = weakProviderLocation('Cloudflare provider status');

  return event({
    provider: 'cloudflare',
    idValue: cleanString(maintenance.id) ?? title,
    timestampMs: startMs,
    severity: 'medium',
    title,
    summary: `${title}${maintenance.status ? ` (${formatToken(maintenance.status)})` : ''}.`,
    tags: compactStrings(['cloudflare-status', 'maintenance', maintenance.status, maintenance.impact]),
    startedAt: isoFromMs(startMs),
    endedAt: isoFromMs(endMs),
    lastObservedAt: isoFromMs(fetchedAt ?? startMs) ?? DEFAULT_ISO,
    locations: [location],
    sourceUrl: cleanString(maintenance.shortlink),
    fetchedAt,
    confidence: 0.58,
  });
}

function rssItemToEvent(provider: 'okta' | 'm365' | 'azure' | 'wasabi', item: RssItem, fetchedAt?: number): SignalMapEvent {
  const title = cleanString(item.title) ?? `${PROVIDER_LABELS[provider]} event`;
  const description = cleanString(item.description);
  const startMs = toEpochMs(item.pubDate);
  const guid = cleanGuid(item.guid);
  const location = provider === 'wasabi' ? wasabiLocation(title, description) : weakProviderLocation(PROVIDER_LABELS[provider]);
  const maintenance = /\b(maintenance|advisory)\b/i.test(`${title} ${description ?? ''}`);

  return event({
    provider,
    idValue: guid ?? cleanString(item.link) ?? title,
    timestampMs: startMs,
    severity: maintenance ? 'medium' : provider === 'm365' ? 'high' : 'medium',
    title,
    summary: description ?? title,
    tags: compactStrings([provider, maintenance ? 'maintenance' : 'incident', ...geoTags(`${title} ${description ?? ''}`)]),
    startedAt: isoFromMs(startMs),
    lastObservedAt: isoFromMs(fetchedAt ?? startMs) ?? DEFAULT_ISO,
    locations: [location],
    sourceUrl: cleanString(item.link),
    fetchedAt,
    confidence: location.confidence >= 0.7 ? 0.8 : 0.6,
  });
}

function event(input: {
  provider: Provider;
  idValue: string;
  timestampMs?: number;
  severity: string;
  title: string;
  summary: string;
  tags: string[];
  startedAt?: string;
  endedAt?: string;
  lastObservedAt: string;
  locations: SignalMapLocation[];
  sourceUrl?: string;
  fetchedAt?: number;
  confidence: number;
}): SignalMapEvent {
  const primaryLocation = input.locations[0];

  return {
    id: stableId('provider-status', input.provider, input.idValue, input.timestampMs),
    category: 'provider',
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    tags: compactStrings(['provider-status', ...input.tags]),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    lastObservedAt: input.lastObservedAt,
    locations: input.locations,
    sources: [providerSource(input.provider, input.sourceUrl, input.fetchedAt, input.timestampMs)],
    confidence: input.confidence,
    provider: input.provider,
    kind: 'provider_status',
    watchlistMatch: false,
    markerEligible: hasUsableGeography(primaryLocation) && input.confidence >= 0.7,
  };
}

function providerSource(provider: Provider, url: string | undefined, fetchedAt: number | undefined, eventMs: number | undefined): SignalMapSource {
  return {
    id: PROVIDER_STATUS_SOURCE_ID,
    label: PROVIDER_LABELS[provider],
    url,
    tier: 1,
    verified: true,
    fetchedAt: isoFromMs(fetchedAt ?? eventMs),
  };
}

function providerHealth(
  provider: Provider,
  hasPayload: boolean,
  events: SignalMapEvent[],
  fetchedAt: number | undefined,
): SignalMapSourceHealth {
  const status = hasPayload ? 'ok' : 'unavailable';
  return {
    id: `${PROVIDER_STATUS_SOURCE_ID}:${provider}`,
    label: PROVIDER_LABELS[provider],
    status,
    fetchedAt: fetchedAt ?? fallbackFetchedAt(events),
    eventCount: events.length,
    detail: status === 'unavailable'
      ? `${PROVIDER_LABELS[provider]} payload unavailable`
      : events.length > 0
        ? `${events.length} active ${PROVIDER_LABELS[provider]} event${events.length === 1 ? '' : 's'}`
        : `${PROVIDER_LABELS[provider]} has no current events`,
  };
}

function payloadProvided(provider: Provider, input: SignalMapProviderStatusInput): boolean {
  if (provider === 'cloudflare') return input.cloudflarePayload != null;
  if (provider === 'okta') return input.oktaPayload != null;
  if (provider === 'm365') return input.m365Payload != null;
  if (provider === 'azure') return input.azurePayload != null;
  return input.wasabiPayload != null;
}

function extractRssItems(xml: string): RssItem[] {
  try {
    const parsed = RSS_PARSER.parse(xml);
    const channel = parsed?.rss?.channel;
    const rawItems = channel?.item;
    if (!rawItems) return [];
    return (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(isRecord) as RssItem[];
  } catch {
    return [];
  }
}

function isActiveProviderItem(item: RssItem): boolean {
  const text = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (/\b(resolved|recovered|completed|closed|restored)\b/.test(text)) return false;
  return /\b(degradation|degraded|outage|incident|maintenance|advisory)\b/.test(text);
}

function isResolvedStatus(status: unknown): boolean {
  const key = normalizeToken(status);
  return key === 'resolved' || key === 'completed' || key === 'postmortem';
}

function isOperationalStatus(status: unknown): boolean {
  const key = normalizeToken(status);
  return !key || key === 'operational' || key === 'none';
}

function impactSeverity(impact: unknown): string {
  const key = normalizeToken(impact);
  if (key === 'critical') return 'critical';
  if (key === 'major') return 'high';
  if (key === 'minor') return 'medium';
  if (key === 'maintenance') return 'medium';
  return 'info';
}

function cloudflareLocation(title: string): SignalMapLocation {
  if (/western europe/i.test(title)) {
    return {
      name: 'Western Europe',
      scope: 'region',
      lat: 50.85,
      lon: 4.35,
      confidence: 0.74,
      evidence: title,
    };
  }
  return weakProviderLocation('Cloudflare provider status');
}

function wasabiLocation(title: string, description: string | undefined): SignalMapLocation {
  const text = `${title} ${description ?? ''}`.toUpperCase();
  const region = Object.keys(WASABI_REGIONS).find((candidate) => text.includes(candidate));
  const location = region ? WASABI_REGIONS[region] : undefined;
  return location ? { ...location } : weakProviderLocation('Wasabi provider status');
}

function weakProviderLocation(name: string): SignalMapLocation {
  return {
    name,
    scope: 'provider',
    confidence: 0.45,
    evidence: 'Provider-wide status feed without specific geography',
  };
}

function hasUsableGeography(location: SignalMapLocation | undefined): boolean {
  return Boolean(location && location.lat != null && location.lon != null && location.confidence >= 0.7);
}

function geoTags(text: string): string[] {
  const tags: string[] = [];
  if (/western europe/i.test(text)) tags.push('Western Europe');
  for (const region of Object.keys(WASABI_REGIONS)) {
    if (text.toUpperCase().includes(region)) tags.push(region);
  }
  return tags;
}

function stableId(prefix: string, provider: string, value: string, ms: number | undefined): string {
  const normalized = `${provider}-${value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${normalized || 'unknown'}${ms ? `-${ms}` : ''}`;
}

function fallbackFetchedAt(events: SignalMapEvent[]): number {
  for (const event of events) {
    const parsed = Date.parse(event.lastObservedAt || event.startedAt || event.endedAt || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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

function cleanGuid(value: RssItem['guid']): string | undefined {
  if (typeof value === 'string') return cleanString(value);
  return cleanString(value?.['#text']);
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(cleanString).filter((value): value is string => Boolean(value)))];
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeToken(value: unknown): string | undefined {
  return cleanString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatToken(value: unknown): string | undefined {
  const token = normalizeToken(value);
  return token
    ?.split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

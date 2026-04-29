import {
  SignalMapServiceClient,
  type ListSignalMapEventsRequest,
  type ListSignalMapEventsResponse,
  type SignalMapEvent as GeneratedSignalMapEvent,
} from '@/generated/client/worldmonitor/signalmap/v1/service_client';
import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  SIGNALMAP_CATEGORIES,
  isSignalMapCategory,
  isSignalMapSeverity,
} from '@/config/signalmap';
import {
  annotateSignalMapWatchlistMatches,
  loadSignalMapWatchlist,
  prioritizeSignalMapWatchlistMatches,
  type SignalMapWatchlistState,
  type SignalMapWatchlistStorage,
} from '@/services/signalmap-watchlist';
import type {
  SignalMapEvent,
  SignalMapKind,
  SignalMapLocationScope,
} from '@/types/signalmap';
import type { TimeRange } from '@/components';

export const SIGNALMAP_VARIANT = 'signalmap';
export const SIGNALMAP_STATE_EVENT = 'signalmap:state';
export const SIGNALMAP_WATCHLIST_CHANGED_EVENT = 'signalmap:watchlist-changed';

export type SignalMapSourceHealth = {
  id: string;
  label: string;
  status: string;
  fetchedAt: number;
  eventCount: number;
  detail: string;
};

export type SignalMapServiceState = {
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
  fetchedAt: number;
  upstreamUnavailable: boolean;
  stale: boolean;
  watchlist: SignalMapWatchlistState;
  requestedAt: number;
};

type SignalMapClient = Pick<SignalMapServiceClient, 'listSignalMapEvents'>;

type SignalMapEventsRequestOptions = {
  categories?: readonly string[];
  watchlist?: SignalMapWatchlistState;
  storage?: SignalMapWatchlistStorage;
  timeRange?: TimeRange;
  now?: number;
  watchlistOnly?: boolean;
};

type FetchSignalMapStateOptions = SignalMapEventsRequestOptions & {
  client?: SignalMapClient;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

const SIGNALMAP_STALE_AFTER_MS = 15 * 60 * 1000;
const TIME_RANGE_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
const VALID_KINDS = new Set<SignalMapKind>(['radar_outage', 'radar_anomaly', 'provider_status', 'story']);
const VALID_LOCATION_SCOPES = new Set<SignalMapLocationScope>([
  'city',
  'region',
  'country',
  'network',
  'provider',
  'unknown',
]);

export function isSignalMapVariant(variant?: string): boolean {
  if (variant === SIGNALMAP_VARIANT) return true;

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return hostname.toLowerCase().startsWith(`${SIGNALMAP_VARIANT}.`);
}

function normalizeCategories(categories?: readonly string[]): string[] {
  if (!categories) return [...SIGNALMAP_CATEGORIES];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const category of categories) {
    if (typeof category !== 'string' || !isSignalMapCategory(category) || seen.has(category)) {
      continue;
    }
    seen.add(category);
    normalized.push(category);
  }
  return normalized;
}

export function buildSignalMapEventsRequest(
  options: SignalMapEventsRequestOptions = {},
): ListSignalMapEventsRequest {
  const now = options.now ?? Date.now();
  const timeRange = options.timeRange ?? '7d';
  const startMs = timeRange === 'all' ? 0 : Math.max(0, now - TIME_RANGE_MS[timeRange]);
  const watchlist = options.watchlist ?? loadSignalMapWatchlist(options.storage);

  return {
    startMs,
    endMs: now,
    categories: normalizeCategories(options.categories),
    watchRegions: watchlist.regions,
    watchProviders: watchlist.providers,
    watchlistOnly: options.watchlistOnly ?? false,
  };
}

export function isSignalMapResponseStale(
  fetchedAt: number,
  now = Date.now(),
  maxAgeMs = SIGNALMAP_STALE_AFTER_MS,
): boolean {
  return !Number.isFinite(fetchedAt) || fetchedAt <= 0 || now - fetchedAt > maxAgeMs;
}

function normalizeEvent(event: GeneratedSignalMapEvent): SignalMapEvent | null {
  if (
    !isSignalMapCategory(event.category) ||
    !isSignalMapSeverity(event.severity) ||
    !VALID_KINDS.has(event.kind as SignalMapKind)
  ) {
    return null;
  }

  const locations = event.locations
    .filter((location) => VALID_LOCATION_SCOPES.has(location.scope as SignalMapLocationScope))
    .map((location) => ({
      name: location.name,
      ...(location.countryIso2 ? { countryIso2: location.countryIso2.toUpperCase() } : {}),
      ...(typeof location.lat === 'number' ? { lat: location.lat } : {}),
      ...(typeof location.lon === 'number' ? { lon: location.lon } : {}),
      scope: location.scope as SignalMapLocationScope,
      confidence: Number.isFinite(location.confidence) ? location.confidence : 0,
      ...(location.evidence ? { evidence: location.evidence } : {}),
    }));

  return {
    id: event.id,
    category: event.category,
    severity: event.severity,
    title: event.title,
    summary: event.summary,
    tags: Array.isArray(event.tags) ? event.tags.filter((tag) => typeof tag === 'string') : [],
    ...(event.startedAt ? { startedAt: event.startedAt } : {}),
    ...(event.endedAt ? { endedAt: event.endedAt } : {}),
    lastObservedAt: event.lastObservedAt,
    locations,
    sources: event.sources.map((source) => ({
      id: source.id,
      label: source.label,
      ...(source.url ? { url: source.url } : {}),
      ...(typeof source.tier === 'number' ? { tier: source.tier } : {}),
      ...(typeof source.verified === 'boolean' ? { verified: source.verified } : {}),
      ...(source.fetchedAt ? { fetchedAt: source.fetchedAt } : {}),
    })),
    confidence: Number.isFinite(event.confidence) ? event.confidence : 0,
    ...(event.provider ? { provider: event.provider } : {}),
    kind: event.kind as SignalMapKind,
    watchlistMatch: event.watchlistMatch,
    markerEligible: event.markerEligible,
  };
}

function normalizeSourceHealth(response: ListSignalMapEventsResponse): SignalMapSourceHealth[] {
  return response.sourceHealth.map((source) => ({
    id: source.id || 'unknown',
    label: source.label || source.id || 'Unknown source',
    status: source.status || 'unknown',
    fetchedAt: Number.isFinite(source.fetchedAt) ? source.fetchedAt : 0,
    eventCount: Number.isFinite(source.eventCount) ? source.eventCount : 0,
    detail: source.detail || '',
  }));
}

function degradedSignalMapState(requestedAt: number, watchlist: SignalMapWatchlistState): SignalMapServiceState {
  return {
    events: [],
    sourceHealth: [{
      id: 'signalmap-api',
      label: 'SignalMap API',
      status: 'unavailable',
      fetchedAt: 0,
      eventCount: 0,
      detail: 'SignalMap events are temporarily unavailable.',
    }],
    fetchedAt: 0,
    upstreamUnavailable: true,
    stale: true,
    watchlist,
    requestedAt,
  };
}

export async function fetchSignalMapState(
  options: FetchSignalMapStateOptions = {},
): Promise<SignalMapServiceState> {
  const requestedAt = options.now ?? Date.now();
  const watchlist = options.watchlist ?? loadSignalMapWatchlist(options.storage);
  const request = buildSignalMapEventsRequest({ ...options, now: requestedAt, watchlist });
  const client = options.client ?? new SignalMapServiceClient(
    options.baseUrl ?? getRpcBaseUrl(),
    { fetch: options.fetch ?? ((...args) => globalThis.fetch(...args)) },
  );

  try {
    const response = await client.listSignalMapEvents(request, { signal: options.signal });
    const normalizedEvents = response.events
      .map(normalizeEvent)
      .filter((event): event is SignalMapEvent => event !== null);
    const annotatedEvents = annotateSignalMapWatchlistMatches(normalizedEvents, watchlist);
    const events = prioritizeSignalMapWatchlistMatches(annotatedEvents, watchlist);
    const stale = response.upstreamUnavailable || isSignalMapResponseStale(response.fetchedAt, requestedAt);

    return {
      events,
      sourceHealth: normalizeSourceHealth(response),
      fetchedAt: Number.isFinite(response.fetchedAt) ? response.fetchedAt : 0,
      upstreamUnavailable: response.upstreamUnavailable,
      stale,
      watchlist,
      requestedAt,
    };
  } catch (error) {
    console.warn('[SignalMap] Failed to fetch state:', error);
    return degradedSignalMapState(requestedAt, watchlist);
  }
}

export function dispatchSignalMapState(
  state: SignalMapServiceState,
  target: Pick<EventTarget, 'dispatchEvent'> | undefined = typeof window !== 'undefined' ? window : undefined,
): void {
  if (!target || typeof target.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') {
    return;
  }

  target.dispatchEvent(new CustomEvent(SIGNALMAP_STATE_EVENT, { detail: state }));
}

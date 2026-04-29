import type {
  ListSignalMapEventsRequest,
  ListSignalMapEventsResponse,
  SignalMapSourceHealth,
} from '../../../../src/generated/server/worldmonitor/signalmap/v1/service_server';

import { getCachedJson } from '../../../_shared/redis';

export const SIGNALMAP_EVENTS_CACHE_PREFIX = 'signalmap:events:v1';

function normalizeFilter(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeTime(value: number | string | undefined): string {
  return value == null || value === '' ? '0' : String(value);
}

export function buildSignalMapEventsCacheKey(req: ListSignalMapEventsRequest): string {
  const parts = [
    `start=${normalizeTime(req.startMs)}`,
    `end=${normalizeTime(req.endMs)}`,
    `categories=${normalizeFilter(req.categories).join(',')}`,
    `watch_regions=${normalizeFilter(req.watchRegions).join(',')}`,
    `watch_providers=${normalizeFilter(req.watchProviders).join(',')}`,
    `watchlist_only=${req.watchlistOnly === true ? '1' : '0'}`,
  ];

  return `${SIGNALMAP_EVENTS_CACHE_PREFIX}:${parts.join(':')}`;
}

function degradedSourceHealth(now: number): SignalMapSourceHealth[] {
  return [
    {
      id: 'cloudflare-radar',
      label: 'Cloudflare Radar',
      status: 'unavailable',
      fetchedAt: now,
      eventCount: 0,
      detail: 'No cached SignalMap payload is available.',
    },
    {
      id: 'provider-status',
      label: 'Provider Status',
      status: 'unavailable',
      fetchedAt: now,
      eventCount: 0,
      detail: 'No cached SignalMap payload is available.',
    },
    {
      id: 'news',
      label: 'News',
      status: 'degraded',
      fetchedAt: now,
      eventCount: 0,
      detail: 'No cached SignalMap payload is available.',
    },
  ];
}

function degradedResponse(now = Date.now()): ListSignalMapEventsResponse {
  return {
    events: [],
    sourceHealth: degradedSourceHealth(now),
    fetchedAt: now,
    upstreamUnavailable: true,
  };
}

function normalizeCachedResponse(
  value: ListSignalMapEventsResponse,
  now = Date.now(),
): ListSignalMapEventsResponse {
  return {
    events: Array.isArray(value.events) ? value.events : [],
    sourceHealth: Array.isArray(value.sourceHealth) && value.sourceHealth.length > 0
      ? value.sourceHealth
      : degradedSourceHealth(now),
    fetchedAt: Number.isFinite(value.fetchedAt) ? value.fetchedAt : now,
    upstreamUnavailable: value.upstreamUnavailable === true,
  };
}

export async function listSignalMapEvents(
  _ctx: object,
  req: ListSignalMapEventsRequest,
): Promise<ListSignalMapEventsResponse> {
  const cacheKey = buildSignalMapEventsCacheKey(req);
  try {
    const result = await getCachedJson(cacheKey, true) as ListSignalMapEventsResponse | null;
    return result ? normalizeCachedResponse(result) : degradedResponse();
  } catch {
    return degradedResponse();
  }
}

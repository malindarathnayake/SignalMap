import { h, replaceChildren } from '@/utils/dom-utils';
import type { SignalMapEvent } from '@/types/signalmap';
import type { SignalMapSourceHealth } from '@/services/signalmap';

export interface SignalMapStatusPayload {
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
  stale: boolean;
  upstreamUnavailable: boolean;
  fetchedAt: number;
}

function hasRenderableMarker(event: SignalMapEvent): boolean {
  return event.markerEligible && event.locations.some((location) =>
    typeof location.lat === 'number' &&
    typeof location.lon === 'number' &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lon),
  );
}

function formatRelativeTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'No recent fetch';
  const diffMs = Date.now() - value;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('healthy') || normalized === 'ok') return 'ok';
  if (normalized.includes('degraded') || normalized.includes('partial')) return 'degraded';
  if (normalized.includes('unavailable') || normalized.includes('down') || normalized.includes('error')) {
    return 'down';
  }
  return 'unknown';
}

export class SignalMapStatusStrips {
  private readonly element: HTMLElement;

  constructor() {
    this.element = h('div', {
      className: 'signalmap-status-strips',
      'data-testid': 'signalmap-status-strips',
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setData(payload: SignalMapStatusPayload): void {
    const radarEvents = payload.events.filter((event) => event.kind === 'radar_outage' || event.kind === 'radar_anomaly');
    const providerEvents = payload.events.filter((event) => event.kind === 'provider_status');
    const watchedEvents = payload.events.filter((event) => event.watchlistMatch);
    const watchedMarkers = watchedEvents.filter(hasRenderableMarker).length;
    const degradedSources = payload.sourceHealth.filter((source) => statusClass(source.status) !== 'ok');
    const radarCritical = radarEvents.filter((event) => event.severity === 'critical' || event.severity === 'high').length;
    const providerSummary = degradedSources.length > 0
      ? `${degradedSources.length} source${degradedSources.length === 1 ? '' : 's'} degraded`
      : `${payload.sourceHealth.length} sources nominal`;

    replaceChildren(this.element,
      h('div', {
        className: `signalmap-strip ${radarCritical > 0 ? 'hot' : 'steady'}`,
        'data-testid': 'signalmap-radar-strip',
      },
        h('span', { className: 'signalmap-strip-label' }, 'Radar'),
        h('strong', {}, `${radarEvents.length}`),
        h('span', {}, radarCritical > 0 ? `${radarCritical} high impact` : 'traffic scan steady'),
      ),
      h('div', {
        className: `signalmap-strip ${payload.upstreamUnavailable || payload.stale ? 'degraded' : 'steady'}`,
        'data-testid': 'signalmap-provider-strip',
      },
        h('span', { className: 'signalmap-strip-label' }, 'Providers'),
        h('strong', {}, `${providerEvents.length}`),
        h('span', {}, providerSummary),
        h('small', {}, formatRelativeTime(payload.fetchedAt)),
      ),
      h('div', {
        className: `signalmap-strip ${watchedEvents.length > 0 ? 'hot' : 'steady'}`,
        'data-testid': 'signalmap-watchlist-strip',
      },
        h('span', { className: 'signalmap-strip-label' }, 'Watchlist'),
        h('strong', {}, `${watchedEvents.length}`),
        h('span', {}, watchedEvents.length > 0
          ? `${watchedMarkers} marker${watchedMarkers === 1 ? '' : 's'} promoted`
          : 'no watched hits'),
      ),
    );
  }
}

import { SIGNALMAP_LOCATION_CONFIDENCE_MIN } from '@/config/signalmap';
import { h, replaceChildren } from '@/utils/dom-utils';
import type { SignalMapEvent } from '@/types/signalmap';
import type { SignalMapSourceHealth } from '@/services/signalmap';

export interface SignalMapInspectorState {
  sourceHealth: SignalMapSourceHealth[];
  stale: boolean;
  upstreamUnavailable: boolean;
  fetchedAt: number;
}

function formatTime(value: string | number): string {
  const date = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(date) || date <= 0) return 'unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function sourceStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('healthy') || normalized === 'ok') return 'ok';
  if (normalized.includes('degraded') || normalized.includes('partial')) return 'degraded';
  if (normalized.includes('unavailable') || normalized.includes('down') || normalized.includes('error')) {
    return 'down';
  }
  return 'unknown';
}

export class SignalMapInspector {
  private readonly element: HTMLElement;

  constructor() {
    this.element = h('div', {
      className: 'signalmap-inspector',
      'data-testid': 'signalmap-inspector',
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setState(state: SignalMapInspectorState, selected: SignalMapEvent | null): void {
    if (!selected) {
      replaceChildren(this.element,
        h('div', { className: 'signalmap-empty', 'data-testid': 'signalmap-inspector-empty' },
          'Select a SignalMap event to inspect source and location details.',
        ),
      );
      return;
    }

    const lowConfidence = selected.confidence < SIGNALMAP_LOCATION_CONFIDENCE_MIN;
    const feedOnly = !selected.markerEligible;
    const eventSourceIds = new Set(selected.sources.map((source) => source.id));
    const relatedHealth = state.sourceHealth.filter((source) => eventSourceIds.has(source.id));
    const healthRows = relatedHealth.length > 0 ? relatedHealth : state.sourceHealth.slice(0, 4);

    replaceChildren(this.element,
      h('div', { className: 'signalmap-inspector-head' },
        h('span', { className: `signalmap-inspector-severity severity-${selected.severity}` }, selected.severity),
        selected.watchlistMatch
          ? h('span', { className: 'signalmap-watch-pill', 'data-testid': 'signalmap-inspector-watchlist' }, 'Watchlist')
          : null,
        h('h3', {}, selected.title),
        h('p', {}, selected.summary),
      ),
      state.stale || state.upstreamUnavailable
        ? h('div', { className: 'signalmap-state-warning', 'data-testid': 'signalmap-stale-state' },
          state.upstreamUnavailable
            ? 'Upstream sources are unavailable; displaying the last degraded SignalMap state.'
            : 'SignalMap data is stale; verify before acting on this event.',
        )
        : null,
      lowConfidence || feedOnly
        ? h('div', { className: 'signalmap-feed-only', 'data-testid': 'signalmap-feed-only-note' },
          feedOnly
            ? 'Feed-only signal: static context or low-confidence locations are intentionally not promoted to map markers.'
            : 'Low-confidence location: this signal needs corroboration before map promotion.',
        )
        : null,
      h('div', { className: 'signalmap-detail-grid' },
        h('div', {},
          h('span', { className: 'signalmap-detail-label' }, 'Observed'),
          h('strong', {}, formatTime(selected.lastObservedAt)),
        ),
        h('div', {},
          h('span', { className: 'signalmap-detail-label' }, 'Confidence'),
          h('strong', {}, `${Math.round(selected.confidence * 100)}%`),
        ),
        h('div', {},
          h('span', { className: 'signalmap-detail-label' }, 'Category'),
          h('strong', {}, selected.category.replace('_', ' ')),
        ),
        h('div', {},
          h('span', { className: 'signalmap-detail-label' }, 'Provider'),
          h('strong', {}, selected.provider ?? 'mixed sources'),
        ),
      ),
      h('section', { className: 'signalmap-inspector-section' },
        h('h4', {}, 'Locations'),
        selected.locations.length > 0
          ? h('div', { className: 'signalmap-location-list', 'data-testid': 'signalmap-location-list' },
            ...selected.locations.map((location) =>
              h('div', { className: 'signalmap-location-row' },
                h('strong', {}, location.name),
                h('span', {}, [
                  location.countryIso2,
                  location.scope,
                  `${Math.round(location.confidence * 100)}%`,
                ].filter(Boolean).join(' / ')),
                location.evidence ? h('small', {}, location.evidence) : null,
              ),
            ),
          )
          : h('p', { className: 'signalmap-muted' }, 'No reliable location extracted.'),
      ),
      h('section', { className: 'signalmap-inspector-section' },
        h('h4', {}, 'Sources'),
        h('div', { className: 'signalmap-source-list', 'data-testid': 'signalmap-source-list' },
          ...selected.sources.map((source) =>
            h('a', {
              className: 'signalmap-source-chip',
              href: source.url ?? '#',
              target: source.url ? '_blank' : undefined,
              rel: source.url ? 'noopener' : undefined,
            },
              source.label,
              source.verified ? h('span', {}, ' verified') : null,
            ),
          ),
        ),
      ),
      h('section', { className: 'signalmap-inspector-section' },
        h('h4', {}, 'Source health'),
        h('div', { className: 'signalmap-health-list', 'data-testid': 'signalmap-source-health' },
          ...healthRows.map((source) =>
            h('div', { className: `signalmap-health-row ${sourceStatusClass(source.status)}` },
              h('span', {}, source.label),
              h('strong', {}, source.status || 'unknown'),
              h('small', {}, `${source.eventCount} events / fetched ${formatTime(source.fetchedAt)}`),
              source.detail ? h('small', {}, source.detail) : null,
            ),
          ),
        ),
      ),
    );
  }
}

import { h, replaceChildren } from '@/utils/dom-utils';
import type { SignalMapEvent } from '@/types/signalmap';

function formatObserved(value: string): string {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return 'time unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function labelForKind(kind: SignalMapEvent['kind']): string {
  switch (kind) {
    case 'radar_outage':
      return 'Radar outage';
    case 'radar_anomaly':
      return 'Radar anomaly';
    case 'provider_status':
      return 'Provider incident';
    case 'story':
      return 'Feed story';
    default:
      return kind;
  }
}

export class SignalMapFeed {
  private readonly element: HTMLElement;
  private readonly onSelect: (eventId: string) => void;

  constructor(onSelect: (eventId: string) => void) {
    this.onSelect = onSelect;
    this.element = h('div', {
      className: 'signalmap-feed',
      'data-testid': 'signalmap-feed',
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setEvents(events: SignalMapEvent[], selectedId: string | null): void {
    if (events.length === 0) {
      replaceChildren(this.element,
        h('div', { className: 'signalmap-empty', 'data-testid': 'signalmap-feed-empty' },
          'No events match the current filters.',
        ),
      );
      return;
    }

    replaceChildren(this.element,
      ...events.map((event) => {
        const row = h('button', {
          type: 'button',
          className: [
            'signalmap-feed-row',
            `severity-${event.severity}`,
            event.watchlistMatch ? 'watchlist-match' : '',
            selectedId === event.id ? 'selected' : '',
          ].filter(Boolean).join(' '),
          'data-testid': 'signalmap-feed-row',
          'data-event-id': event.id,
          onClick: () => this.onSelect(event.id),
        },
          h('span', { className: 'signalmap-row-top' },
            h('span', { className: 'signalmap-kind' }, labelForKind(event.kind)),
            h('span', { className: 'signalmap-time' }, formatObserved(event.lastObservedAt)),
          ),
          h('span', { className: 'signalmap-row-title' }, event.title),
          h('span', { className: 'signalmap-row-summary' }, event.summary),
          h('span', { className: 'signalmap-row-meta' },
            h('span', { className: 'signalmap-severity' }, event.severity),
            event.provider ? h('span', {}, event.provider) : null,
            h('span', {}, `${Math.round(event.confidence * 100)}% confidence`),
            event.watchlistMatch ? h('span', { className: 'signalmap-watch-pill' }, 'Watchlist') : null,
          ),
        );
        return row;
      }),
    );
  }
}

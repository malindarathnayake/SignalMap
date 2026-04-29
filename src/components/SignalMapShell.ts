import { Panel, type PanelSeverity } from './Panel';
import { SignalMapFeed } from './SignalMapFeed';
import { SignalMapInspector } from './SignalMapInspector';
import { SignalMapStatusStrips } from './SignalMapStatusStrips';
import {
  SIGNALMAP_CATEGORIES,
  SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES,
  SIGNALMAP_PROVIDERS,
  SIGNALMAP_REGION_GROUPS,
  SIGNALMAP_STORAGE_KEYS,
  isSignalMapCategory,
  type SignalMapProviderId,
  type SignalMapRegionGroupId,
} from '@/config/signalmap';
import {
  SIGNALMAP_WATCHLIST_CHANGED_EVENT,
  type SignalMapSourceHealth,
} from '@/services/signalmap';
import {
  loadSignalMapWatchlist,
  saveSignalMapWatchlist,
  type SignalMapWatchlistState,
} from '@/services/signalmap-watchlist';
import { h, replaceChildren } from '@/utils/dom-utils';
import type { SignalMapCategory, SignalMapEvent, SignalMapSeverity } from '@/types/signalmap';

export interface SignalMapPanelPayload {
  events: SignalMapEvent[];
  sourceHealth: SignalMapSourceHealth[];
  stale: boolean;
  upstreamUnavailable: boolean;
  fetchedAt: number;
  watchlist: SignalMapWatchlistState;
}

const severityRank: Record<SignalMapSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function toPanelSeverity(severity: SignalMapSeverity | null): PanelSeverity {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  if (severity === 'low' || severity === 'info') return 'low';
  return 'none';
}

function loadActiveCategories(): SignalMapCategory[] {
  try {
    const raw = localStorage.getItem(SIGNALMAP_STORAGE_KEYS.activeCategories);
    if (!raw) return [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
    const seen = new Set<SignalMapCategory>();
    const values: SignalMapCategory[] = [];
    for (const value of parsed) {
      if (typeof value !== 'string' || !isSignalMapCategory(value)) {
        return [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
      }
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
    }
    return values.length > 0 ? values : [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
  } catch {
    return [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
  }
}

function saveActiveCategories(categories: readonly SignalMapCategory[]): void {
  try {
    localStorage.setItem(SIGNALMAP_STORAGE_KEYS.activeCategories, JSON.stringify(categories));
  } catch {
    // Browser storage can be disabled; the in-memory filter still works.
  }
}

function matchesSearch(event: SignalMapEvent, query: string): boolean {
  if (!query) return true;
  const haystack = [
    event.title,
    event.summary,
    event.category,
    event.provider ?? '',
    event.severity,
    ...event.tags,
    ...event.locations.map((location) => `${location.name} ${location.countryIso2 ?? ''}`),
    ...event.sources.map((source) => source.label),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

export class SignalMapShell extends Panel {
  private readonly statusStrips = new SignalMapStatusStrips();
  private readonly feed = new SignalMapFeed((eventId) => {
    this.selectedEventId = eventId;
    this.renderDataViews();
  });
  private readonly inspector = new SignalMapInspector();
  private readonly searchInput: HTMLInputElement;
  private readonly categoryControlsEl: HTMLElement;
  private readonly watchlistControlsEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private payload: SignalMapPanelPayload = {
    events: [],
    sourceHealth: [],
    stale: false,
    upstreamUnavailable: false,
    fetchedAt: 0,
    watchlist: loadSignalMapWatchlist(),
  };
  private activeCategories: SignalMapCategory[] = loadActiveCategories();
  private selectedEventId: string | null = null;
  private searchTerm = '';

  constructor() {
    super({
      id: 'signalmap',
      title: 'SignalMap',
      showCount: true,
      className: 'signalmap-panel panel-wide',
      defaultRowSpan: 3,
    });

    this.element.dataset.testid = 'signalmap-shell-panel';
    this.content.classList.add('signalmap-content');

    this.searchInput = h('input', {
      type: 'search',
      className: 'signalmap-search',
      placeholder: 'Search events, providers, regions',
      'aria-label': 'Search SignalMap events',
      'data-testid': 'signalmap-search',
    }) as HTMLInputElement;
    this.searchInput.addEventListener('input', () => {
      this.searchTerm = this.searchInput.value.trim().toLowerCase();
      this.renderDataViews();
    });

    this.categoryControlsEl = h('div', {
      className: 'signalmap-category-controls',
      'data-testid': 'signalmap-category-controls',
    });
    this.watchlistControlsEl = h('div', {
      className: 'signalmap-watchlist-controls',
      'data-testid': 'signalmap-watchlist-controls',
    });
    this.bodyEl = h('div', { className: 'signalmap-body' });

    replaceChildren(this.content,
      h('div', { className: 'signalmap-shell', 'data-testid': 'signalmap-shell' },
        h('div', { className: 'signalmap-command' },
          h('div', { className: 'signalmap-brand' },
            h('span', { className: 'signalmap-brand-mark' }, 'SM'),
            h('div', {},
              h('strong', {}, 'SignalMap'),
              h('span', {}, 'Live internet, provider, and feed signals'),
            ),
          ),
          this.searchInput,
          this.categoryControlsEl,
        ),
        this.statusStrips.getElement(),
        this.watchlistControlsEl,
        this.bodyEl,
      ),
    );

    this.renderControls();
    this.renderDataViews();
  }

  setData(payload: SignalMapPanelPayload): void {
    this.applyPayload(payload);
  }

  setEvents(payload: SignalMapPanelPayload): void {
    this.applyPayload(payload);
  }

  setState(payload: SignalMapPanelPayload): void {
    this.applyPayload(payload);
  }

  private applyPayload(payload: SignalMapPanelPayload): void {
    this.payload = {
      events: Array.isArray(payload.events) ? payload.events : [],
      sourceHealth: Array.isArray(payload.sourceHealth) ? payload.sourceHealth : [],
      stale: Boolean(payload.stale),
      upstreamUnavailable: Boolean(payload.upstreamUnavailable),
      fetchedAt: Number.isFinite(payload.fetchedAt) ? payload.fetchedAt : 0,
      watchlist: payload.watchlist ?? loadSignalMapWatchlist(),
    };
    this.renderControls();
    this.renderDataViews();
  }

  private renderControls(): void {
    const activeSet = new Set(this.activeCategories);
    replaceChildren(this.categoryControlsEl,
      ...SIGNALMAP_CATEGORIES.map((category) =>
        h('button', {
          type: 'button',
          className: `signalmap-chip ${activeSet.has(category) ? 'active' : ''}`,
          'data-testid': 'signalmap-category-chip',
          'data-category': category,
          onClick: () => this.toggleCategory(category),
        }, category.replace('_', ' ')),
      ),
    );

    const regionSet = new Set(this.payload.watchlist.regions);
    const providerSet = new Set(this.payload.watchlist.providers);

    replaceChildren(this.watchlistControlsEl,
      h('div', { className: 'signalmap-watch-group' },
        h('span', { className: 'signalmap-watch-label' }, 'Regions'),
        ...Object.values(SIGNALMAP_REGION_GROUPS).map((region) =>
          h('button', {
            type: 'button',
            className: `signalmap-chip watch ${regionSet.has(region.id) ? 'active' : ''}`,
            'data-testid': 'signalmap-region-chip',
            'data-region': region.id,
            onClick: () => this.toggleWatchRegion(region.id),
          }, region.label),
        ),
      ),
      h('div', { className: 'signalmap-watch-group' },
        h('span', { className: 'signalmap-watch-label' }, 'Providers'),
        ...Object.values(SIGNALMAP_PROVIDERS).map((provider) =>
          h('button', {
            type: 'button',
            className: `signalmap-chip watch ${providerSet.has(provider.id) ? 'active' : ''}`,
            'data-testid': 'signalmap-provider-chip',
            'data-provider': provider.id,
            onClick: () => this.toggleWatchProvider(provider.id),
          }, provider.label),
        ),
      ),
    );
  }

  private renderDataViews(): void {
    const filtered = this.getFilteredEvents();
    if (!filtered.some((event) => event.id === this.selectedEventId)) {
      this.selectedEventId = filtered[0]?.id ?? null;
    }

    const selected = filtered.find((event) => event.id === this.selectedEventId) ?? null;
    this.setCount(filtered.length);
    this.setDataBadge(
      this.payload.upstreamUnavailable ? 'unavailable' : this.payload.stale ? 'cached' : 'live',
      this.payload.stale ? 'stale' : undefined,
    );
    this.setSeverity(toPanelSeverity(this.getHighestSeverity(filtered)));
    this.statusStrips.setData(this.payload);
    this.feed.setEvents(filtered, this.selectedEventId);
    this.inspector.setState(this.payload, selected);

    replaceChildren(this.bodyEl,
      h('div', { className: 'signalmap-feed-pane' }, this.feed.getElement()),
      h('div', { className: 'signalmap-inspector-pane' }, this.inspector.getElement()),
    );
  }

  private getFilteredEvents(): SignalMapEvent[] {
    const activeSet = new Set(this.activeCategories);
    return this.payload.events.filter((event) =>
      activeSet.has(event.category) && matchesSearch(event, this.searchTerm),
    );
  }

  private getHighestSeverity(events: readonly SignalMapEvent[]): SignalMapSeverity | null {
    let highest: SignalMapSeverity | null = null;
    for (const event of events) {
      if (!highest || severityRank[event.severity] > severityRank[highest]) {
        highest = event.severity;
      }
    }
    return highest;
  }

  private toggleCategory(category: SignalMapCategory): void {
    const activeSet = new Set(this.activeCategories);
    if (activeSet.has(category)) {
      activeSet.delete(category);
    } else {
      activeSet.add(category);
    }
    this.activeCategories = activeSet.size > 0
      ? SIGNALMAP_CATEGORIES.filter((candidate) => activeSet.has(candidate))
      : [...SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES];
    saveActiveCategories(this.activeCategories);
    this.renderControls();
    this.renderDataViews();
  }

  private toggleWatchRegion(regionId: SignalMapRegionGroupId): void {
    const regions = this.toggleId(this.payload.watchlist.regions, regionId);
    this.saveWatchlist({ ...this.payload.watchlist, regions });
  }

  private toggleWatchProvider(providerId: SignalMapProviderId): void {
    const providers = this.toggleId(this.payload.watchlist.providers, providerId);
    this.saveWatchlist({ ...this.payload.watchlist, providers });
  }

  private toggleId<T extends string>(values: readonly T[], value: T): T[] {
    return values.includes(value)
      ? values.filter((candidate) => candidate !== value)
      : [...values, value];
  }

  private saveWatchlist(next: SignalMapWatchlistState): void {
    this.payload = {
      ...this.payload,
      watchlist: saveSignalMapWatchlist(next),
    };
    window.dispatchEvent(new Event(SIGNALMAP_WATCHLIST_CHANGED_EVENT));
    this.renderControls();
    this.renderDataViews();
  }
}

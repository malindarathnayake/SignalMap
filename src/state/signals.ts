import { signal, computed } from '@preact/signals';
import { LIST_EVENTS_FIXTURE } from '../fixtures/signalmap.ts';

export type Severity = 'critical' | 'major' | 'minor' | 'info';
export type Category =
  | 'internet' | 'provider' | 'geopolitics' | 'conflict' | 'finance'
  | 'technology' | 'cyber' | 'climate' | 'health' | 'energy' | 'supply' | 'infra';

export type SignalLocation = { name: string; lon?: number; lat?: number; scope?: string };

export type SignalSource = {
  id?: string;
  label: string;
  url?: string;
  tier?: number;
  verified?: boolean;
  fetchedAt?: string;
};

export type SignalEvent = {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  summary?: string;
  startedAt: number;
  locations: SignalLocation[];
  // Source attribution — RSS/radar/provider URLs that produced this event.
  // Rendered as clickable links in the inspector. Populated by the collector;
  // older fixtures may omit this so it's optional.
  sources?: SignalSource[];
  // Internet category extras
  radarKind?: 'outage' | 'anomaly';
  // Provider category extras
  provider?: string;
  // Watchlist hint computed by collector (Phase 6+); irrelevant for 4b counts
  watchlistMatch?: boolean;
  // Honored by the map filter — events with markerEligible=false render
  // in the feed but never as a map marker (e.g. PyPI / non-place entities).
  markerEligible?: boolean;
};

const initial = new Map<string, SignalEvent>();
for (const ev of LIST_EVENTS_FIXTURE.events) initial.set(ev.id, ev);

export const signals = signal<Map<string, SignalEvent>>(initial);

export const selectedEventId = signal<string | null>(null);

/**
 * Events with first-location lon+lat populated as finite numbers AND
 * markerEligible !== false. Some events (software registries, platforms,
 * non-place entities like PyPI) have nominal lat/lon for backwards
 * compatibility but are explicitly tagged feed-only by the collector;
 * they should still appear in the live feed but NEVER as a map marker.
 *
 * MapMarker rendering and the active-count overlay both consume this.
 */
export const mappableEvents = computed<SignalEvent[]>(() => {
  const out: SignalEvent[] = [];
  for (const ev of signals.value.values()) {
    if (ev.markerEligible === false) continue;
    const loc = ev.locations[0];
    if (!loc) continue;
    if (typeof loc.lon !== 'number' || typeof loc.lat !== 'number') continue;
    if (!Number.isFinite(loc.lon) || !Number.isFinite(loc.lat)) continue;
    out.push(ev);
  }
  return out;
});

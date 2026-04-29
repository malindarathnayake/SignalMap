import { signal, computed } from '@preact/signals';
import { LIST_EVENTS_FIXTURE } from '../fixtures/signalmap.ts';

export type Severity = 'critical' | 'major' | 'minor' | 'info';
export type Category =
  | 'internet' | 'provider' | 'geopolitics' | 'conflict' | 'finance'
  | 'technology' | 'cyber' | 'climate' | 'health' | 'energy' | 'supply' | 'infra';

export type SignalLocation = { name: string; lon?: number; lat?: number; scope?: string };

export type SignalEvent = {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  summary?: string;
  startedAt: number;
  locations: SignalLocation[];
  // Internet category extras
  radarKind?: 'outage' | 'anomaly';
  // Provider category extras
  provider?: string;
  // Watchlist hint computed by collector (Phase 6+); irrelevant for 4b counts
  watchlistMatch?: boolean;
};

const initial = new Map<string, SignalEvent>();
for (const ev of LIST_EVENTS_FIXTURE.events) initial.set(ev.id, ev);

export const signals = signal<Map<string, SignalEvent>>(initial);

export const selectedEventId = signal<string | null>(null);

/**
 * Events with first-location lon+lat populated as finite numbers.
 * MapMarker rendering and the active-count overlay both consume this.
 */
export const mappableEvents = computed<SignalEvent[]>(() => {
  const out: SignalEvent[] = [];
  for (const ev of signals.value.values()) {
    const loc = ev.locations[0];
    if (!loc) continue;
    if (typeof loc.lon !== 'number' || typeof loc.lat !== 'number') continue;
    if (!Number.isFinite(loc.lon) || !Number.isFinite(loc.lat)) continue;
    out.push(ev);
  }
  return out;
});

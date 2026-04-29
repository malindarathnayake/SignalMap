import { signal } from '@preact/signals';
import { persist } from './persist.ts';

export const providers = persist(
  signal<string[]>(['cloudflare', 'm365']),
  'signalmap-watchlist-providers',
);

export const regions = persist(
  signal<string[]>([]),
  'signalmap-watchlist-regions',
);

export type MapOverlayLevel = 'off' | 'incident' | 'main' | 'all';
export const OVERLAY_LEVELS: readonly MapOverlayLevel[] = ['off', 'incident', 'main', 'all'] as const;
export const OVERLAY_LEVEL_LABELS: Record<MapOverlayLevel, string> = {
  off: 'Off',
  incident: 'On incident',
  main: 'Main',
  all: 'All',
};

// Tolerant reader: persisted state may carry a legacy boolean from an
// earlier version of MapControlsState — coerce true → 'incident',
// false → 'off', and any malformed value back to the default.
export function readOverlayLevel(v: unknown): MapOverlayLevel {
  if (v === true) return 'incident';
  if (v === false) return 'off';
  if (typeof v === 'string' && (OVERLAY_LEVELS as readonly string[]).includes(v)) {
    return v as MapOverlayLevel;
  }
  return 'incident';
}

export type MapControlsState = {
  cluster: boolean;
  minConfidence: number;     // 0..1
  showCables: MapOverlayLevel;
  showDatacenters: MapOverlayLevel;
  brightness: number;        // 0.5..4.0, 1 = neutral
  cableThickness: number;    // 0.05..1.5 stroke-width multiplier (major); minor = 0.7x
};

export const mapControls = persist(
  signal<MapControlsState>({
    cluster: true,
    minConfidence: 0.5,
    showCables: 'off',
    showDatacenters: 'incident',
    brightness: 1,
    cableThickness: 0.1,
  }),
  'signalmap-watchlist-map-controls',
);

// LiveFeed resize/collapse state — Feature: drag handle to resize, collapse to hide
export const feedHeight = persist(signal(158), 'signalmap-feed-height');
export const feedCollapsed = persist(signal(false), 'signalmap-feed-collapsed');

export type Watchpoint = {
  id: string;
  label: string;
  match: string; // substring matched against event location.name (case-insensitive)
};

export const DEFAULT_WATCHPOINTS: Watchpoint[] = [
  { id: 'tel-aviv', label: 'Tel Aviv', match: 'tel aviv' },
  { id: 'tehran', label: 'Tehran', match: 'tehran' },
  { id: 'kyiv', label: 'Kyiv', match: 'kyiv' },
  { id: 'moscow', label: 'Moscow', match: 'moscow' },
  { id: 'london', label: 'London', match: 'london' },
  { id: 'nyc', label: 'New York', match: 'new york' },
  { id: 'dc', label: 'Washington DC', match: 'washington' },
  { id: 'paris', label: 'Paris', match: 'paris' },
  { id: 'tokyo', label: 'Tokyo', match: 'tokyo' },
];

export const watchpoints = persist(
  signal<Watchpoint[]>(DEFAULT_WATCHPOINTS),
  'signalmap-watchpoints',
);

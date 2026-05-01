import { signal } from '@preact/signals';
import { persist } from './persist.ts';

export const TIME_RANGES = ['1h', '6h', '24h', '7d'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

const DEFAULT_CATEGORIES = [
  'internet', 'provider', 'geopolitics', 'conflict', 'finance',
  'technology', 'cyber', 'climate', 'health', 'energy', 'supply', 'infra',
];

export const query = persist(signal(''), 'signalmap-filters-query');
export const timeRange = persist(signal<TimeRange>('24h'), 'signalmap-filters-timerange');
export const categories = persist(
  signal<string[]>(DEFAULT_CATEGORIES),
  'signalmap-filters-categories',
);

export type FeedSeverityFilter = 'all' | 'main';
export const feedSeverityFilter = persist(
  signal<FeedSeverityFilter>('all'),
  'signalmap-filters-feed-severity',
);

export const ALL_SEVERITIES = ['critical', 'major', 'minor', 'info'] as const;
export type FeedSeverity = (typeof ALL_SEVERITIES)[number];
export const mainSeverities = persist(
  signal<FeedSeverity[]>(['critical', 'major']),
  'signalmap-filters-main-severities',
);

// Map-only marker-kind filter (controlled by the legend in MapOverlays).
// Hides specific marker shapes on the map without affecting the live feed.
// `kind` is derived from category + radarKind by getMarkerKind in src/utils/marker-kind.ts.
export const ALL_MAP_KINDS = ['outage', 'anomaly', 'provider', 'event'] as const;
export type MapKind = (typeof ALL_MAP_KINDS)[number];
export const mapKinds = persist(
  signal<MapKind[]>([...ALL_MAP_KINDS]),
  'signalmap-filters-map-kinds',
);

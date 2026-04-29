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

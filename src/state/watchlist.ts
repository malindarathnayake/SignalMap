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

export type MapControlsState = {
  cluster: boolean;
  minConfidence: number;     // 0..1
  showCables: boolean;
  showDatacenters: boolean;
};

export const mapControls = persist(
  signal<MapControlsState>({
    cluster: true,
    minConfidence: 0.5,
    showCables: false,
    showDatacenters: false,
  }),
  'signalmap-watchlist-map-controls',
);

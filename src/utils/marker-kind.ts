import type { SignalEvent } from '../state/signals.ts';
import type { MapKind } from '../state/filters.ts';

/**
 * Derives the legend kind for a SignalEvent. Mirrors the shape-selection
 * logic in MapMarker.tsx so the legend filter and the marker render stay
 * in lockstep.
 */
export function getMarkerKind(ev: SignalEvent): MapKind {
  if (ev.category === 'internet' && ev.radarKind === 'outage') return 'outage';
  if (ev.category === 'internet' && ev.radarKind === 'anomaly') return 'anomaly';
  if (ev.category === 'provider') return 'provider';
  return 'event';
}

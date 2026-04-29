import type { SignalEvent } from './signals.ts';

// Standard regions — geographic bounding boxes [minLon, minLat, maxLon, maxLat].
// Cloud regions (azure-*, wasabi-*) don't have bboxes; events match them only
// via explicit metadata (currently not modeled, so cloud regions are advisory-
// only at the filter level — they show the watchlist halo but don't filter).
export const REGION_BBOX: Record<string, [number, number, number, number]> = {
  na:    [-170, 5,   -50, 75],
  eu:    [-25,  35,   45, 72],
  mena:  [-20,  10,   65, 40],
  apac:  [60,   -45, 180, 55],
  sa:    [60,   5,    95, 38],
  af:    [-20,  -38,  55, 38],
  latam: [-95,  -57, -30, 15],
  // 'global' intentionally absent — selecting Global means "no region filter".
};

export function isInBBox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

export function eventInRegions(event: SignalEvent, regionIds: readonly string[]): boolean {
  // Empty selection → match everything (no filter).
  // Selecting 'global' is also treated as "show everything".
  if (regionIds.length === 0 || regionIds.includes('global')) return true;

  // If the only selected regions are cloud regions (no bbox), don't filter.
  const bboxes = regionIds
    .map(id => REGION_BBOX[id])
    .filter((b): b is [number, number, number, number] => Array.isArray(b));
  if (bboxes.length === 0) return true;

  for (const loc of event.locations) {
    if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number') continue;
    for (const bbox of bboxes) {
      if (isInBBox(loc.lat, loc.lon, bbox)) return true;
    }
  }
  return false;
}

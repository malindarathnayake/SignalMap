import {
  SIGNALMAP_DEFAULT_WATCH_PROVIDERS,
  SIGNALMAP_DEFAULT_WATCH_REGIONS,
  SIGNALMAP_REGION_GROUPS,
  SIGNALMAP_STORAGE_KEYS,
  type SignalMapProviderId,
  type SignalMapRegionGroupId,
  isSignalMapProviderId,
  isSignalMapRegionGroupId,
} from '@/config/signalmap';
import type { SignalMapEvent } from '@/types/signalmap';

export type SignalMapWatchlistState = {
  regions: SignalMapRegionGroupId[];
  providers: SignalMapProviderId[];
};

export type SignalMapWatchlistStorage = Pick<Storage, 'getItem' | 'setItem'>;

type WatchlistField = 'regions' | 'providers';

const defaultWatchlistState: SignalMapWatchlistState = {
  regions: [...SIGNALMAP_DEFAULT_WATCH_REGIONS],
  providers: [...SIGNALMAP_DEFAULT_WATCH_PROVIDERS],
};

function getBrowserStorage(): SignalMapWatchlistStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeIds<T extends string>(
  value: unknown,
  defaults: readonly T[],
  isValid: (candidate: string) => candidate is T,
): T[] {
  if (value === undefined || !Array.isArray(value)) {
    return [...defaults];
  }

  const seen = new Set<T>();
  const ids: T[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'string' || !isValid(candidate) || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    ids.push(candidate);
  }

  return ids;
}

export function normalizeSignalMapWatchlistState(
  input: Partial<{ regions: unknown; providers: unknown }> = {},
): SignalMapWatchlistState {
  return {
    regions: normalizeIds(
      input.regions,
      defaultWatchlistState.regions,
      isSignalMapRegionGroupId,
    ),
    providers: normalizeIds(
      input.providers,
      defaultWatchlistState.providers,
      isSignalMapProviderId,
    ),
  };
}

function readWatchlistField(storage: SignalMapWatchlistStorage, field: WatchlistField): unknown {
  const key =
    field === 'regions' ? SIGNALMAP_STORAGE_KEYS.watchRegions : SIGNALMAP_STORAGE_KEYS.watchProviders;

  const rawValue = storage.getItem(key);
  if (rawValue === null) {
    return undefined;
  }

  return JSON.parse(rawValue);
}

export function loadSignalMapWatchlist(
  storage: SignalMapWatchlistStorage | undefined = getBrowserStorage(),
): SignalMapWatchlistState {
  if (!storage) {
    return normalizeSignalMapWatchlistState();
  }

  try {
    return normalizeSignalMapWatchlistState({
      regions: readWatchlistField(storage, 'regions'),
      providers: readWatchlistField(storage, 'providers'),
    });
  } catch {
    return normalizeSignalMapWatchlistState();
  }
}

export function saveSignalMapWatchlist(
  state: Partial<{ regions: unknown; providers: unknown }>,
  storage: SignalMapWatchlistStorage | undefined = getBrowserStorage(),
): SignalMapWatchlistState {
  const normalizedState = normalizeSignalMapWatchlistState(state);

  if (!storage) {
    return normalizedState;
  }

  try {
    storage.setItem(SIGNALMAP_STORAGE_KEYS.watchRegions, JSON.stringify(normalizedState.regions));
    storage.setItem(SIGNALMAP_STORAGE_KEYS.watchProviders, JSON.stringify(normalizedState.providers));
  } catch {
    // Storage can be blocked or full in browsers. The normalized in-memory state is still usable.
  }

  return normalizedState;
}

function eventMatchesProvider(event: SignalMapEvent, state: SignalMapWatchlistState): boolean {
  return Boolean(
    event.provider && isSignalMapProviderId(event.provider) && state.providers.includes(event.provider),
  );
}

function eventMatchesGlobalRegion(event: SignalMapEvent): boolean {
  if (event.locations.length === 0) {
    return true;
  }

  return event.locations.some(
    (location) => location.scope === 'unknown' || !location.countryIso2,
  );
}

function eventMatchesWatchedRegion(event: SignalMapEvent, state: SignalMapWatchlistState): boolean {
  const watchedCountries = new Set<string>();

  for (const regionId of state.regions) {
    if (regionId === 'global') {
      continue;
    }

    for (const countryIso2 of SIGNALMAP_REGION_GROUPS[regionId].countryIso2) {
      watchedCountries.add(countryIso2);
    }
  }

  const matchesCountry = event.locations.some((location) => {
    if (!location.countryIso2) {
      return false;
    }

    return watchedCountries.has(location.countryIso2.toUpperCase());
  });

  return matchesCountry || (state.regions.includes('global') && eventMatchesGlobalRegion(event));
}

export function signalMapEventMatchesWatchlist(
  event: SignalMapEvent,
  state: SignalMapWatchlistState = defaultWatchlistState,
): boolean {
  return eventMatchesProvider(event, state) || eventMatchesWatchedRegion(event, state);
}

export function annotateSignalMapWatchlistMatches(
  events: readonly SignalMapEvent[],
  state: SignalMapWatchlistState = defaultWatchlistState,
): SignalMapEvent[] {
  return events.map((event) => ({
    ...event,
    watchlistMatch: signalMapEventMatchesWatchlist(event, state),
  }));
}

export function prioritizeSignalMapWatchlistMatches(
  events: readonly SignalMapEvent[],
  state: SignalMapWatchlistState = defaultWatchlistState,
): SignalMapEvent[] {
  const annotatedEvents = annotateSignalMapWatchlistMatches(events, state);
  const matchedEvents = annotatedEvents.filter((event) => event.watchlistMatch);
  const unmatchedEvents = annotatedEvents.filter((event) => !event.watchlistMatch);

  return [...matchedEvents, ...unmatchedEvents];
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SIGNALMAP_CATEGORIES,
  SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES,
  SIGNALMAP_DEFAULT_LLM_MODEL,
  SIGNALMAP_DEFAULT_WATCH_PROVIDERS,
  SIGNALMAP_DEFAULT_WATCH_REGIONS,
  SIGNALMAP_LOCATION_CONFIDENCE_MIN,
  SIGNALMAP_PROVIDERS,
  SIGNALMAP_REGION_GROUPS,
  SIGNALMAP_SEVERITIES,
  SIGNALMAP_STORAGE_KEYS,
  isSignalMapCategory,
  isSignalMapProviderId,
  isSignalMapRegionGroupId,
  isSignalMapSeverity,
} from '../src/config/signalmap.ts';
import {
  annotateSignalMapWatchlistMatches,
  loadSignalMapWatchlist,
  normalizeSignalMapWatchlistState,
  prioritizeSignalMapWatchlistMatches,
  saveSignalMapWatchlist,
} from '../src/services/signalmap-watchlist.ts';

const signalMapTypesSource = readFileSync(new URL('../src/types/signalmap.ts', import.meta.url), 'utf8');

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} ids must be unique`);
}

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  const calls = [];

  return {
    calls,
    getItem(key) {
      calls.push(['getItem', key]);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['setItem', key, value]);
      values.set(key, value);
    },
  };
}

function createSignalMapEvent(overrides = {}) {
  return {
    id: 'event',
    category: 'provider',
    severity: 'medium',
    title: 'Event',
    summary: 'SignalMap event',
    tags: [],
    lastObservedAt: '2026-04-26T00:00:00.000Z',
    locations: [],
    sources: [],
    confidence: 0.9,
    kind: 'provider_status',
    watchlistMatch: false,
    markerEligible: false,
    ...overrides,
  };
}

describe('SignalMap watchlist config', () => {
  it('uses the storage keys and defaults from the spec', () => {
    assert.deepEqual(SIGNALMAP_STORAGE_KEYS, {
      watchRegions: 'signalmap-watch-regions',
      watchProviders: 'signalmap-watch-providers',
      activeCategories: 'signalmap-active-categories',
      llmModel: 'signalmap-llm-model',
    });

    assert.deepEqual(SIGNALMAP_DEFAULT_WATCH_REGIONS, ['na', 'eu']);
    assert.deepEqual(SIGNALMAP_DEFAULT_WATCH_PROVIDERS, ['cloudflare', 'azure', 'm365']);
    assert.deepEqual(SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES, SIGNALMAP_CATEGORIES);
    assert.equal(SIGNALMAP_DEFAULT_LLM_MODEL, 'server-default');
  });

  it('keeps categories, providers, regions, and severities controlled and unique', () => {
    assertUnique(SIGNALMAP_CATEGORIES, 'category');
    assertUnique(SIGNALMAP_SEVERITIES, 'severity');
    assertUnique(Object.keys(SIGNALMAP_PROVIDERS), 'provider');
    assertUnique(Object.keys(SIGNALMAP_REGION_GROUPS), 'region group');

    assert.deepEqual(SIGNALMAP_CATEGORIES, [
      'internet',
      'provider',
      'technology',
      'finance',
      'geopolitics',
      'conflict',
      'cyber',
      'climate',
      'health',
      'energy',
      'supply_chain',
      'infrastructure',
    ]);

    assert.deepEqual(Object.keys(SIGNALMAP_PROVIDERS), ['cloudflare', 'okta', 'm365', 'azure', 'wasabi']);
    assert.deepEqual(Object.keys(SIGNALMAP_REGION_GROUPS), ['na', 'eu', 'latam', 'mena', 'africa', 'apac', 'global']);
    assert.ok(Object.hasOwn(SIGNALMAP_REGION_GROUPS, 'na'));
    assert.ok(Object.hasOwn(SIGNALMAP_REGION_GROUPS, 'eu'));
  });

  it('validates defaults against registries', () => {
    for (const category of SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES) {
      assert.ok(isSignalMapCategory(category), `invalid default category: ${category}`);
    }

    for (const provider of SIGNALMAP_DEFAULT_WATCH_PROVIDERS) {
      assert.ok(isSignalMapProviderId(provider), `invalid default provider: ${provider}`);
    }

    for (const region of SIGNALMAP_DEFAULT_WATCH_REGIONS) {
      assert.ok(isSignalMapRegionGroupId(region), `invalid default region: ${region}`);
    }
  });

  it('rejects free-form categories and validates known severities', () => {
    assert.equal(isSignalMapCategory('internet'), true);
    assert.equal(isSignalMapCategory('custom'), false);
    assert.equal(isSignalMapProviderId('aws'), false);
    assert.equal(isSignalMapRegionGroupId('mars'), false);
    assert.equal(isSignalMapSeverity('critical'), true);
    assert.equal(isSignalMapSeverity('urgent'), false);
  });

  it('keeps the public event contract fields aligned with the spec', () => {
    assert.match(signalMapTypesSource, /export type SignalMapRegionGroup\s*=/);
    assert.match(signalMapTypesSource, /export interface SignalMapProviderConfig\s*{/);
    assert.match(signalMapTypesSource, /export interface SignalMapRegionGroupConfig\s*{/);
    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*category:\s*SignalMapCategory;/);
    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*severity:\s*SignalMapSeverity;/);
    assert.match(signalMapTypesSource, /export interface SignalMapSource\s*{[\s\S]*tier\?:\s*number;/);
    assert.match(signalMapTypesSource, /export interface SignalMapEvent\s*{[\s\S]*kind:\s*SignalMapKind;/);
    assert.match(signalMapTypesSource, /watchlistMatch:\s*boolean;/);
    assert.match(signalMapTypesSource, /markerEligible:\s*boolean;/);
  });

  it('sets the default location confidence threshold to 0.7 within range', () => {
    assert.equal(SIGNALMAP_LOCATION_CONFIDENCE_MIN, 0.7);
    assert.ok(SIGNALMAP_LOCATION_CONFIDENCE_MIN >= 0);
    assert.ok(SIGNALMAP_LOCATION_CONFIDENCE_MIN <= 1);
  });
});

describe('SignalMap watchlist service', () => {
  it('loads defaults from missing storage', () => {
    const storage = createMemoryStorage();

    assert.deepEqual(loadSignalMapWatchlist(storage), {
      regions: ['na', 'eu'],
      providers: ['cloudflare', 'azure', 'm365'],
    });
  });

  it('falls back to defaults for invalid JSON without throwing', () => {
    const storage = createMemoryStorage({
      [SIGNALMAP_STORAGE_KEYS.watchRegions]: '{bad json',
      [SIGNALMAP_STORAGE_KEYS.watchProviders]: JSON.stringify(['okta']),
    });

    assert.doesNotThrow(() => loadSignalMapWatchlist(storage));
    assert.deepEqual(loadSignalMapWatchlist(storage), {
      regions: ['na', 'eu'],
      providers: ['cloudflare', 'azure', 'm365'],
    });
  });

  it('drops invalid ids and dedupes while preserving first valid order', () => {
    assert.deepEqual(
      normalizeSignalMapWatchlistState({
        regions: ['mars', 'eu', 'na', 'eu', 'global', 1, 'na'],
        providers: ['aws', 'okta', 'azure', 'okta', null, 'cloudflare'],
      }),
      {
        regions: ['eu', 'na', 'global'],
        providers: ['okta', 'azure', 'cloudflare'],
      },
    );
  });

  it('keeps saved empty arrays empty after save and load', () => {
    const storage = createMemoryStorage();

    assert.deepEqual(saveSignalMapWatchlist({ regions: [], providers: [] }, storage), {
      regions: [],
      providers: [],
    });
    assert.deepEqual(loadSignalMapWatchlist(storage), {
      regions: [],
      providers: [],
    });
  });

  it('uses the configured storage keys exactly', () => {
    const storage = createMemoryStorage();

    loadSignalMapWatchlist(storage);
    saveSignalMapWatchlist({ regions: ['apac'], providers: ['wasabi'] }, storage);

    assert.deepEqual(storage.calls, [
      ['getItem', SIGNALMAP_STORAGE_KEYS.watchRegions],
      ['getItem', SIGNALMAP_STORAGE_KEYS.watchProviders],
      ['setItem', SIGNALMAP_STORAGE_KEYS.watchRegions, JSON.stringify(['apac'])],
      ['setItem', SIGNALMAP_STORAGE_KEYS.watchProviders, JSON.stringify(['wasabi'])],
    ]);
  });

  it('annotates provider and region matches while retaining unmatched events', () => {
    const events = [
      createSignalMapEvent({ id: 'provider-match', provider: 'okta' }),
      createSignalMapEvent({
        id: 'region-match',
        provider: 'unknown-provider',
        locations: [{ name: 'Tokyo', countryIso2: 'JP', scope: 'city', confidence: 0.9 }],
      }),
      createSignalMapEvent({
        id: 'unmatched',
        provider: 'unknown-provider',
        locations: [{ name: 'Sao Paulo', countryIso2: 'BR', scope: 'city', confidence: 0.9 }],
      }),
    ];

    const annotated = annotateSignalMapWatchlistMatches(events, {
      regions: ['apac'],
      providers: ['okta'],
    });

    assert.deepEqual(annotated.map((event) => [event.id, event.watchlistMatch]), [
      ['provider-match', true],
      ['region-match', true],
      ['unmatched', false],
    ]);
    assert.deepEqual(annotated.map((event) => event.id), ['provider-match', 'region-match', 'unmatched']);
    assert.notEqual(annotated[0], events[0]);
    assert.equal(events[0].watchlistMatch, false);
  });

  it('matches global only for unlocated or unknown-country events', () => {
    const events = [
      createSignalMapEvent({ id: 'no-locations', locations: [] }),
      createSignalMapEvent({
        id: 'no-country',
        locations: [{ name: 'Internet', scope: 'network', confidence: 0.8 }],
      }),
      createSignalMapEvent({
        id: 'unknown-scope',
        locations: [{ name: 'Unknown', scope: 'unknown', confidence: 0.7 }],
      }),
      createSignalMapEvent({
        id: 'known-country',
        locations: [{ name: 'New York', countryIso2: 'US', scope: 'city', confidence: 0.9 }],
      }),
    ];

    const annotated = annotateSignalMapWatchlistMatches(events, {
      regions: ['global'],
      providers: [],
    });

    assert.deepEqual(annotated.map((event) => [event.id, event.watchlistMatch]), [
      ['no-locations', true],
      ['no-country', true],
      ['unknown-scope', true],
      ['known-country', false],
    ]);
  });

  it('prioritizes matches stably and retains unmatched events', () => {
    const events = [
      createSignalMapEvent({
        id: 'first-unmatched',
        locations: [{ name: 'Paris', countryIso2: 'FR', scope: 'city', confidence: 0.9 }],
      }),
      createSignalMapEvent({ id: 'first-match', provider: 'wasabi' }),
      createSignalMapEvent({
        id: 'second-unmatched',
        locations: [{ name: 'Berlin', countryIso2: 'DE', scope: 'city', confidence: 0.9 }],
      }),
      createSignalMapEvent({ id: 'second-match', provider: 'okta' }),
    ];

    const prioritized = prioritizeSignalMapWatchlistMatches(events, {
      regions: [],
      providers: ['wasabi', 'okta'],
    });

    assert.deepEqual(prioritized.map((event) => event.id), [
      'first-match',
      'second-match',
      'first-unmatched',
      'second-unmatched',
    ]);
    assert.deepEqual(prioritized.map((event) => event.watchlistMatch), [true, true, false, false]);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCloudflareStatus,
  normalizeProviderStatuses,
  normalizeProviderStatusRss,
  PROVIDER_STATUS_CACHE_KEY,
  PROVIDER_STATUS_SOURCE_ID,
} from '../server/worldmonitor/signalmap/v1/_provider-status.ts';

const root = join(import.meta.dirname, '..');
const fixtureDir = join(root, 'tests', 'fixtures', 'signalmap');
const fetchedAt = Date.parse('2026-04-25T03:00:00Z');
const supportedLocationScopes = new Set(['city', 'region', 'country', 'network', 'provider', 'unknown']);

function readJsonFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

function readTextFixture(name) {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

describe('provider status SignalMap normalization', () => {
  it('exports the provider status source and cache constants', () => {
    assert.equal(PROVIDER_STATUS_SOURCE_ID, 'provider-status');
    assert.equal(PROVIDER_STATUS_CACHE_KEY, 'infra:service-statuses:v1');
  });

  it('infrastructure service status handler writes raw SignalMap provider health keys', () => {
    const source = readFileSync(
      join(root, 'server', 'worldmonitor', 'infrastructure', 'v1', 'list-service-statuses.ts'),
      'utf8',
    );

    assert.ok(source.includes("const SIGNALMAP_PROVIDER_KEY = 'signalmap:providers:v1'"));
    assert.ok(source.includes("const SIGNALMAP_PROVIDER_META_KEY = 'seed-meta:signalmap:providers'"));
    assert.ok(source.includes('buildSignalMapProviderHealth'));
    assert.ok(source.includes('recordCount: statuses.length'));
    assert.match(source, /setCachedJson\(\s*SIGNALMAP_PROVIDER_KEY,\s*signalMapHealth,\s*SIGNALMAP_PROVIDER_TTL,\s*true/s);
    assert.match(source, /setCachedJson\(\s*SIGNALMAP_PROVIDER_META_KEY,[\s\S]*SIGNALMAP_PROVIDER_META_TTL,\s*true/s);
  });

  it('supports all provider fixtures in one combined normalization call', () => {
    const result = normalizeProviderStatuses({
      cloudflarePayload: readJsonFixture('cloudflare-status-summary.json'),
      oktaPayload: readTextFixture('okta-status.xml'),
      m365Payload: readTextFixture('m365-status.xml'),
      azurePayload: readTextFixture('azure-status.xml'),
      wasabiPayload: readTextFixture('wasabi-status.xml'),
      fetchedAt,
    });

    assert.equal(result.sourceHealth.length, 5);
    assert.equal(result.events.length, 4);
    assert.deepEqual(
      result.sourceHealth.map((health) => health.status),
      ['ok', 'ok', 'ok', 'ok', 'ok'],
    );
    assert.deepEqual(
      result.events.map((event) => event.provider),
      ['cloudflare', 'cloudflare', 'm365', 'wasabi'],
    );
    for (const event of result.events) {
      for (const location of event.locations) {
        assert.equal(
          supportedLocationScopes.has(location.scope),
          true,
          `${event.id} emitted unsupported location scope ${location.scope}`,
        );
      }
    }
    assert.equal(result.events.filter((event) => event.markerEligible).length, 2);
  });

  it('creates a Cloudflare provider event for Workers Western Europe and skips operational CDN', () => {
    const events = normalizeCloudflareStatus(readJsonFixture('cloudflare-status-summary.json'), fetchedAt);
    const workers = events.find((event) => event.title === 'Elevated Workers latency in Western Europe');

    assert.equal(events.length, 2);
    assert.ok(workers);
    assert.equal(workers.id, 'provider-status-cloudflare-incident-workers-latency-1777081800000');
    assert.equal(workers.category, 'provider');
    assert.equal(workers.kind, 'provider_status');
    assert.equal(workers.provider, 'cloudflare');
    assert.equal(workers.severity, 'medium');
    assert.equal(workers.markerEligible, true);
    assert.equal(workers.watchlistMatch, false);
    assert.equal(workers.confidence, 0.82);
    assert.equal(workers.locations[0].name, 'Western Europe');
    assert.equal(workers.locations[0].scope, 'region');
    assert.equal(workers.locations[0].lat, 50.85);
    assert.equal(workers.locations[0].lon, 4.35);
    assert.equal(workers.sources[0].id, PROVIDER_STATUS_SOURCE_ID);
    assert.equal(workers.sources[0].label, 'Cloudflare Status');
    assert.equal(workers.sources[0].url, 'https://stspg.io/example-workers-latency');
    assert.equal(workers.sources[0].tier, 1);
    assert.equal(workers.sources[0].verified, true);
    assert.equal(workers.sources[0].fetchedAt, '2026-04-25T03:00:00.000Z');
    assert.equal(workers.lastObservedAt, '2026-04-25T03:00:00.000Z');
    assert.equal(events.some((event) => /CDN/.test(event.title)), false);
  });

  it('treats Azure empty RSS as healthy with no Azure events', () => {
    const result = normalizeProviderStatuses({
      azurePayload: readTextFixture('azure-status.xml'),
      fetchedAt,
    });
    const azureHealth = result.sourceHealth.find((health) => health.id === 'provider-status:azure');

    assert.deepEqual(result.events, []);
    assert.ok(azureHealth);
    assert.equal(azureHealth.status, 'ok');
    assert.equal(azureHealth.eventCount, 0);
    assert.equal(azureHealth.fetchedAt, fetchedAt);
    assert.match(azureHealth.detail, /no current events/);
  });

  it('treats Okta resolved RSS as healthy with no Okta events', () => {
    const result = normalizeProviderStatuses({
      oktaPayload: readTextFixture('okta-status.xml'),
      fetchedAt,
    });
    const oktaHealth = result.sourceHealth.find((health) => health.id === 'provider-status:okta');

    assert.deepEqual(result.events, []);
    assert.ok(oktaHealth);
    assert.equal(oktaHealth.status, 'ok');
    assert.equal(oktaHealth.eventCount, 0);
    assert.equal(oktaHealth.fetchedAt, fetchedAt);
    assert.match(oktaHealth.detail, /no current events/);
  });

  it('creates a feed-only Microsoft 365 provider_status event for weak geography', () => {
    const events = normalizeProviderStatusRss('m365', readTextFixture('m365-status.xml'), fetchedAt);
    const event = events[0];

    assert.equal(events.length, 1);
    assert.equal(event.id, 'provider-status-m365-m365-exchange-online-mail-flow-2026-04-25-1777079700000');
    assert.equal(event.provider, 'm365');
    assert.equal(event.kind, 'provider_status');
    assert.equal(event.severity, 'high');
    assert.equal(event.title, 'Service degradation affecting Exchange Online mail flow');
    assert.equal(event.sources[0].url, 'https://status.office365.com/example/exchange-online-mail-flow');
    assert.equal(event.markerEligible, false);
    assert.equal(event.locations[0].scope, 'provider');
    assert.equal(event.locations[0].confidence, 0.45);
    assert.equal(event.locations[0].lat, undefined);
    assert.equal(event.locations[0].lon, undefined);
    assert.equal(event.confidence, 0.6);
  });

  it('creates a deterministic Wasabi maintenance event for US-WEST-1', () => {
    const events = normalizeProviderStatusRss('wasabi', readTextFixture('wasabi-status.xml'), fetchedAt);
    const event = events[0];

    assert.equal(events.length, 1);
    assert.equal(event.id, 'provider-status-wasabi-wasabi-us-west-1-maintenance-2026-04-30-1777046400000');
    assert.equal(event.provider, 'wasabi');
    assert.equal(event.kind, 'provider_status');
    assert.equal(event.severity, 'medium');
    assert.ok(event.tags.includes('maintenance'));
    assert.ok(event.tags.includes('US-WEST-1'));
    assert.equal(event.sources[0].url, 'https://status.wasabi.com/example/us-west-1-maintenance-2026-04-30');
    assert.equal(event.locations[0].name, 'US-WEST-1');
    assert.equal(event.locations[0].countryIso2, 'US');
    assert.equal(event.locations[0].scope, 'region');
    assert.equal(event.locations[0].lat, 37.25);
    assert.equal(event.locations[0].lon, -119.75);
    assert.equal(event.locations[0].confidence, 0.78);
    assert.equal(event.markerEligible, true);
  });

  it('marks missing provider inputs unavailable without events', () => {
    const result = normalizeProviderStatuses({});

    assert.deepEqual(result.events, []);
    assert.equal(result.sourceHealth.length, 5);
    assert.deepEqual(
      result.sourceHealth.map((health) => health.status),
      ['unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable'],
    );
    assert.deepEqual(
      result.sourceHealth.map((health) => health.eventCount),
      [0, 0, 0, 0, 0],
    );
    assert.deepEqual(
      result.sourceHealth.map((health) => health.fetchedAt),
      [0, 0, 0, 0, 0],
    );
  });
});

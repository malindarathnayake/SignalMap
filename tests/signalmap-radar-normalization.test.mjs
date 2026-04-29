import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCloudflareRadar,
  normalizeRadarOutages,
  normalizeRadarTrafficAnomalies,
  RADAR_OUTAGES_CACHE_KEY,
  RADAR_SOURCE_ID,
  RADAR_TRAFFIC_ANOMALIES_CACHE_KEY,
} from '../server/worldmonitor/signalmap/v1/_radar.ts';

const root = join(import.meta.dirname, '..');
const fixtureDir = join(root, 'tests', 'fixtures', 'signalmap');
const fetchedAt = Date.parse('2026-04-25T03:00:00Z');

function readFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

describe('Cloudflare Radar SignalMap normalization', () => {
  it('exports the existing Radar cache keys', () => {
    assert.equal(RADAR_OUTAGES_CACHE_KEY, 'infra:outages:v1');
    assert.equal(RADAR_TRAFFIC_ANOMALIES_CACHE_KEY, 'cf:radar:traffic-anomalies:v1');
    assert.equal(RADAR_SOURCE_ID, 'cloudflare-radar');
  });

  it('internet outages seeder writes SignalMap radar health without token exposure', () => {
    const source = readFileSync(join(root, 'scripts', 'seed-internet-outages.mjs'), 'utf8');

    assert.ok(source.includes("const SIGNALMAP_RADAR_KEY = 'signalmap:radar:v1'"));
    assert.ok(source.includes("const SIGNALMAP_RADAR_META_KEY = 'seed-meta:signalmap:radar'"));
    assert.ok(source.includes('writeSignalMapRadarHealth'));
    assert.ok(source.includes('activeOutages'));
    assert.ok(source.includes('activeTrafficAnomalies'));
    assert.match(
      source,
      /writeExtraKeyWithMeta\(\s*SIGNALMAP_RADAR_KEY,\s*payload,\s*SIGNALMAP_RADAR_TTL,\s*recordCount,\s*SIGNALMAP_RADAR_META_KEY/s,
    );
    assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN[^;]*payload/s);
  });

  it('normalizes raw outage fixture and combined health', () => {
    const outageFixture = readFixture('cloudflare-radar-outage.json');
    const anomalyFixture = readFixture('cloudflare-radar-anomaly.json');

    const result = normalizeCloudflareRadar({
      outagesPayload: outageFixture,
      anomaliesPayload: anomalyFixture,
      fetchedAt,
    });
    const outage = result.events.find((event) => event.kind === 'radar_outage');

    assert.equal(result.events.length, 2);
    assert.equal(result.sourceHealth.length, 1);
    assert.equal(result.sourceHealth[0].status, 'ok');
    assert.equal(result.sourceHealth[0].eventCount, 2);
    assert.equal(result.sourceHealth[0].fetchedAt, fetchedAt);
    assert.match(result.sourceHealth[0].detail, /2 active Cloudflare Radar events/);

    assert.ok(outage);
    assert.equal(outage.category, 'internet');
    assert.equal(outage.provider, 'cloudflare');
    assert.equal(outage.severity, 'high');
    assert.equal(outage.kind, 'radar_outage');
    assert.equal(outage.markerEligible, true);
    assert.equal(outage.watchlistMatch, false);
    assert.equal(outage.locations[0].countryIso2, 'FR');
    assert.equal(outage.locations[0].name, 'France');
    assert.equal(outage.locations[0].scope, 'region');
    assert.equal(outage.locations[0].lat, 46.23);
    assert.equal(outage.locations[0].lon, 2.21);
    assert.equal(outage.sources[0].url, 'https://radar.cloudflare.com/outage/example-fr-power-2026-04-25');
    assert.equal(outage.sources[0].id, RADAR_SOURCE_ID);
    assert.equal(outage.sources[0].label, 'Cloudflare Radar');
    assert.equal(outage.sources[0].tier, 1);
    assert.equal(outage.sources[0].verified, true);
    assert.equal(outage.sources[0].fetchedAt, '2026-04-25T03:00:00.000Z');
    assert.equal(outage.lastObservedAt, '2026-04-25T03:00:00.000Z');
  });

  it('normalizes raw traffic anomaly fixture with type, ASN, and country evidence', () => {
    const anomalyFixture = readFixture('cloudflare-radar-anomaly.json');

    const events = normalizeRadarTrafficAnomalies(anomalyFixture, fetchedAt);
    const anomaly = events[0];

    assert.equal(events.length, 1);
    assert.equal(anomaly.kind, 'radar_anomaly');
    assert.equal(anomaly.category, 'internet');
    assert.equal(anomaly.provider, 'cloudflare');
    assert.equal(anomaly.severity, 'high');
    assert.equal(anomaly.markerEligible, true);
    assert.equal(anomaly.locations[0].countryIso2, 'FR');
    assert.equal(anomaly.locations[0].name, 'France');
    assert.equal(anomaly.locations[0].scope, 'network');
    assert.equal(anomaly.locations[0].lat, 46.23);
    assert.equal(anomaly.locations[0].lon, 2.21);
    assert.ok(anomaly.tags.includes('TRAFFIC_DROP'));
    assert.ok(anomaly.tags.includes('AS3215'));
    assert.ok(anomaly.tags.includes('Orange S.A.'));
    assert.match(anomaly.summary, /Orange S\.A\./);
    assert.match(anomaly.summary, /France/);
  });

  it('supports existing normalized outage and anomaly cache payloads', () => {
    const outagePayload = {
      outages: [
        {
          id: 'cf-fr-major',
          title: 'REGIONAL outage in France',
          link: 'https://radar.cloudflare.com/outage/cf-fr-major',
          description: 'Power disruption affected Internet traffic in France.',
          detectedAt: 1775539800000,
          country: 'France',
          region: '',
          location: { latitude: 46.23, longitude: 2.21 },
          severity: 'OUTAGE_SEVERITY_MAJOR',
          categories: ['Cloudflare Radar', 'POWER OUTAGE', 'REGIONAL'],
          cause: 'POWER_OUTAGE',
          outageType: 'REGIONAL',
          endedAt: 0,
        },
      ],
    };
    const anomalyPayload = {
      anomalies: [
        {
          uuid: 'normalized-anomaly',
          type: 'TRAFFIC_DROP',
          status: 'ACTIVE',
          startDate: 1775539800000,
          endDate: 0,
          asn: '3215',
          asnName: 'Orange S.A.',
          locationCode: 'FR',
          locationName: 'France',
          latitude: 46.23,
          longitude: 2.21,
        },
      ],
      totalCount: 1,
    };

    const events = [
      ...normalizeRadarOutages(outagePayload, fetchedAt),
      ...normalizeRadarTrafficAnomalies(anomalyPayload, fetchedAt),
    ];
    const outage = events.find((event) => event.kind === 'radar_outage');
    const anomaly = events.find((event) => event.kind === 'radar_anomaly');

    assert.equal(events.length, 2);
    assert.equal(outage.severity, 'high');
    assert.equal(outage.title, 'REGIONAL outage in France');
    assert.equal(outage.locations[0].lat, 46.23);
    assert.equal(outage.locations[0].lon, 2.21);
    assert.equal(outage.sources[0].url, 'https://radar.cloudflare.com/outage/cf-fr-major');
    assert.equal(outage.markerEligible, true);

    assert.equal(anomaly.severity, 'high');
    assert.equal(anomaly.locations[0].countryIso2, 'FR');
    assert.equal(anomaly.locations[0].lat, 46.23);
    assert.equal(anomaly.locations[0].lon, 2.21);
    assert.equal(anomaly.markerEligible, true);
  });

  it('treats empty success payloads as healthy no-data', () => {
    const result = normalizeCloudflareRadar({
      outagesPayload: { result: { annotations: [] } },
      anomaliesPayload: { anomalies: [] },
      fetchedAt,
    });

    assert.deepEqual(result.events, []);
    assert.equal(result.sourceHealth.length, 1);
    assert.equal(result.sourceHealth[0].status, 'ok');
    assert.equal(result.sourceHealth[0].eventCount, 0);
    assert.equal(result.sourceHealth[0].fetchedAt, fetchedAt);
    assert.match(result.sourceHealth[0].detail, /no current events/);
    assert.equal(result.events.filter((event) => event.markerEligible).length, 0);
  });

  it('marks missing payloads unavailable without events', () => {
    const result = normalizeCloudflareRadar({});

    assert.deepEqual(result.events, []);
    assert.equal(result.sourceHealth.length, 1);
    assert.equal(result.sourceHealth[0].status, 'unavailable');
    assert.equal(result.sourceHealth[0].eventCount, 0);
    assert.equal(result.sourceHealth[0].fetchedAt, 0);
    assert.match(result.sourceHealth[0].detail, /unavailable/);
  });

  it('keeps ended and non-active records out of marker rendering', () => {
    const endedOutage = normalizeRadarOutages({
      outages: [
        {
          id: 'ended-outage',
          title: 'Ended outage in France',
          detectedAt: 1775539800000,
          endedAt: 1775543400000,
          country: 'France',
          location: { latitude: 46.23, longitude: 2.21 },
          outageType: 'REGIONAL',
        },
      ],
    })[0];
    const inactiveAnomaly = normalizeRadarTrafficAnomalies({
      anomalies: [
        {
          uuid: 'ended-anomaly',
          type: 'TRAFFIC_DROP',
          status: 'ENDED',
          startDate: 1775539800000,
          endDate: 1775543400000,
          locationCode: 'FR',
          locationName: 'France',
        },
      ],
    })[0];

    assert.equal(endedOutage.markerEligible, false);
    assert.equal(endedOutage.endedAt, '2026-04-07T06:30:00.000Z');
    assert.equal(inactiveAnomaly.markerEligible, false);
    assert.equal(inactiveAnomaly.endedAt, '2026-04-07T06:30:00.000Z');
  });
});

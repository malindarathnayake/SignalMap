// Phase 4 deterministic fixtures for /api/signalmap/* and /api/bootstrap.
// Shape matches the UI's SignalEvent type in src/state/signals.ts (Phase 4b).
// NOTE: Phase 3 OpenAPI declares SignalMapEvent with stricter enum members
// (severity: critical|high|medium|low|info; category: ..|supply_chain|infrastructure;
// plus required `lastObservedAt`, `markerEligible`, `kind`, `sources`).
// Phase 4 UI uses a smaller subset; reconciliation is forward-looking work.
import type { SignalEvent } from '../state/signals.ts';

const NOW = Date.now();
const minsAgo = (m: number): number => NOW - m * 60_000;

export const LIST_EVENTS_FIXTURE: { events: SignalEvent[] } = {
  events: [
    // Internet: 2 outage + 2 anomaly
    { id: 'rdr-iq-01', category: 'internet', severity: 'critical', title: 'Regional internet disruption reported in southern Iraq', startedAt: minsAgo(212), locations: [{ name: 'Basra, Iraq', lat: 30.51, lon: 47.78 }], radarKind: 'outage' },
    { id: 'rdr-sd-01', category: 'internet', severity: 'major',    title: 'Sustained connectivity disruption observed in Sudan',    startedAt: minsAgo(1380), locations: [{ name: 'Sudan', lat: 15.50, lon: 32.56 }],       radarKind: 'outage' },
    { id: 'rdr-pk-01', category: 'internet', severity: 'major',    title: 'Cloudflare Radar detects traffic anomaly in Pakistan',   startedAt: minsAgo(74),   locations: [{ name: 'Pakistan', lat: 30.38, lon: 69.35 }],   radarKind: 'anomaly' },
    { id: 'rdr-uk-01', category: 'internet', severity: 'minor',    title: 'ASN-level routing anomaly observed on UK transit network', startedAt: minsAgo(36), locations: [{ name: 'United Kingdom', lat: 55.38, lon: -3.44 }], radarKind: 'anomaly' },
    // Provider: cloudflare, okta, azure, m365
    { id: 'prv-cf-01',     category: 'provider', severity: 'major', title: 'Cloudflare Status reports degraded Workers performance', startedAt: minsAgo(28),  locations: [{ name: 'Global (multi-colo)', lat: 0.00, lon: 0.00 }], provider: 'cloudflare' },
    { id: 'prv-okta-01',   category: 'provider', severity: 'major', title: 'Okta reports elevated sign-in error rates',              startedAt: minsAgo(52),  locations: [{ name: 'Okta cells (multi-region)', lat: 39.74, lon: -104.99 }], provider: 'okta' },
    { id: 'prv-az-weu-01', category: 'provider', severity: 'major', title: 'Azure reports service management issues in West Europe', startedAt: minsAgo(94),  locations: [{ name: 'Azure West Europe', lat: 52.37, lon: 4.90 }], provider: 'azure' },
    { id: 'prv-m365-01',   category: 'provider', severity: 'minor', title: 'Microsoft 365 — Teams meetings degraded for some EMEA users', startedAt: minsAgo(140), locations: [{ name: 'EMEA (subset)', lat: 50.11, lon: 8.68 }], provider: 'm365' },
  ],
};

export const SOURCE_HEALTH_FIXTURE = {
  sources: [
    { id: 'radar',         label: 'Cloudflare Radar',          tier: 1, status: 'ok' as const,        latencyMs: 42 },
    { id: 'cf-status',     label: 'Cloudflare Status',         tier: 1, status: 'ok' as const,        latencyMs: 88 },
    { id: 'okta-status',   label: 'Okta Status RSS',           tier: 1, status: 'ok' as const,        latencyMs: 121 },
    { id: 'm365-health',   label: 'Microsoft Service Health',  tier: 1, status: 'degraded' as const,  latencyMs: 612 },
    { id: 'azure-status',  label: 'Azure Status RSS',          tier: 1, status: 'ok' as const,        latencyMs: 198 },
    { id: 'gdelt',         label: 'GDELT',                     tier: 2, status: 'ok' as const,        latencyMs: 410 },
    { id: 'rss-tier2',     label: 'RSS / Tier-2 News',         tier: 2, status: 'stale' as const,     latencyMs: 2400 },
  ],
};

export const BOOTSTRAP_FIXTURE = {
  filters: {
    timeRange: '24h' as const,
    categories: ['internet', 'provider', 'geopolitics', 'conflict', 'finance', 'technology', 'cyber', 'climate', 'health', 'energy', 'supply', 'infra'],
  },
  signalCount24h: LIST_EVENTS_FIXTURE.events.length,
  // Source health repeated here for the bootstrap snapshot (UI may consume from either endpoint)
  sourceHealth: SOURCE_HEALTH_FIXTURE.sources,
};

export const GLOBAL_BRIEF_FIXTURE = {
  bullets: [
    'Major regional internet disruption observed in southern Iraq.',
    'Cloudflare reports degraded Workers performance globally.',
    'Sustained connectivity loss continues in Sudan.',
  ],
  sources: [
    { label: 'Reuters', url: 'https://reuters.com/example/1' },
    { label: 'Cloudflare Status', url: 'https://www.cloudflarestatus.com' },
  ],
  generatedAt: '2026-04-28T12:00:00Z',
  model: 'anthropic/claude-sonnet-4.6',
  warnings: [] as string[],
  degraded: false,
};

export const EVENT_BRIEF_FIXTURE = {
  bullets: [
    'This event correlates with a previously observed sustained outage and matches a known geopolitical trigger.',
  ],
  sources: [{ label: 'Reuters', url: 'https://reuters.com/example/event' }],
  generatedAt: '2026-04-28T12:05:00Z',
  model: 'anthropic/claude-sonnet-4.6',
  warnings: [] as string[],
  degraded: false,
};

// Cloudflare Radar slugs: ISO 3166 alpha-2 country codes (lowercase),
// or kebab-case continent names. Empty string => no slug, link to the
// Radar homepage instead.
const RADAR_SLUG: Record<string, string> = {
  'Basra, Iraq': 'iq',
  'Sudan': 'sd',
  'Pakistan': 'pk',
  'United Kingdom': 'gb',
  'Global (multi-colo)': '',
  'Okta cells (multi-region)': 'us',
  'Azure West Europe': 'europe',
  'EMEA (subset)': 'europe',
};

// RIPEstat country page (replaces BGPlay which needs an ASN/prefix
// resource, not a country name).
const RIPESTAT_COUNTRY_BASE = 'https://stat.ripe.net/country/';

function radarUrlFor(loc: string): string {
  const slug = RADAR_SLUG[loc];
  if (slug === undefined) {
    // Unknown location: just send to the Radar homepage.
    return 'https://radar.cloudflare.com/';
  }
  if (slug === '') return 'https://radar.cloudflare.com/';
  return `https://radar.cloudflare.com/traffic/${slug}`;
}

function ripestatUrlFor(loc: string): string {
  const slug = RADAR_SLUG[loc];
  // RIPEstat country page only works for actual ISO codes (2 chars).
  // Continents and unknowns fall back to the explorer landing page.
  if (slug && slug.length === 2) return `${RIPESTAT_COUNTRY_BASE}${slug}`;
  return 'https://stat.ripe.net/';
}

// Per-event brief synthesizer for the dev/E2E fixture middleware.
// Each event gets bullets + sources derived from its category, location,
// severity, provider, and radarKind so the inspector shows distinct
// content per event instead of a single hardcoded string.
const PROVIDER_LABEL: Record<string, string> = {
  cloudflare: 'Cloudflare',
  okta: 'Okta',
  azure: 'Azure',
  m365: 'Microsoft 365',
  wasabi: 'Wasabi',
};

const PROVIDER_STATUS_URL: Record<string, string> = {
  cloudflare: 'https://www.cloudflarestatus.com/',
  okta: 'https://status.okta.com/',
  azure: 'https://azure.status.microsoft/en-us/status',
  m365: 'https://status.cloud.microsoft/',
  wasabi: 'https://status.wasabi.com/',
};

function severityWord(sev: SignalEvent['severity']): string {
  if (sev === 'critical') return 'critical';
  if (sev === 'major') return 'major';
  if (sev === 'minor') return 'minor';
  return 'informational';
}

export function buildEventBrief(event: SignalEvent | undefined, eventId: string): typeof EVENT_BRIEF_FIXTURE {
  const fallback: typeof EVENT_BRIEF_FIXTURE = {
    bullets: [
      `Brief unavailable for ${eventId} — event not found in current fixture set.`,
    ],
    sources: [{ label: 'Reuters', url: 'https://www.reuters.com/' }],
    generatedAt: new Date().toISOString(),
    model: 'anthropic/claude-sonnet-4.6 (fixture)',
    warnings: ['event-not-found'],
    degraded: true,
  };
  if (!event) return fallback;

  const loc = event.locations[0]?.name ?? 'unknown location';
  const sev = severityWord(event.severity);
  const locSlug = encodeURIComponent(loc);

  let bullets: string[];
  let sources: { label: string; url: string }[];

  if (event.category === 'internet') {
    const isOutage = event.radarKind === 'outage';
    const kind = isOutage ? 'connectivity outage' : 'routing anomaly';
    bullets = [
      `${kind.charAt(0).toUpperCase()}${kind.slice(1)} in ${loc} — Cloudflare Radar shows a ${sev} departure from the trailing 7-day baseline.`,
      `No public attribution from local operators yet; cross-check BGP/ASN telemetry before correlating with the geopolitical layer.`,
      `Watch follow-on signals (DNS resolution rate, IXP throughput, VPN demand) for the next 60–120 minutes.`,
    ];
    sources = [
      { label: 'Cloudflare Radar', url: radarUrlFor(loc) },
      { label: 'RIPEstat', url: ripestatUrlFor(loc) },
      { label: 'NetBlocks', url: `https://netblocks.org/?s=${locSlug}` },
    ];
  } else if (event.category === 'provider') {
    const provider = event.provider ?? 'unknown';
    const providerName = PROVIDER_LABEL[provider] ?? provider;
    const statusUrl = PROVIDER_STATUS_URL[provider] ?? 'https://status.example.com/';
    bullets = [
      `${providerName} acknowledges ${sev} service degradation affecting ${loc}.`,
      `Watch the official status feed for an incident ID and a post-mortem timeline; user-impact reports on social typically lead the status page by 5–15 minutes.`,
      `Re-validate failover paths if cross-cloud workloads route through ${loc}.`,
    ];
    sources = [
      { label: `${providerName} Status`, url: statusUrl },
      { label: 'Downdetector', url: `https://downdetector.com/status/${provider}/` },
      { label: 'Reuters Tech', url: 'https://www.reuters.com/technology/' },
    ];
  } else {
    bullets = [
      `${event.title} — ${loc} (${sev}).`,
      'No tier-1 wire corroboration yet; verify against AP / Reuters before treating as confirmed.',
    ];
    sources = [
      { label: 'Reuters World', url: 'https://www.reuters.com/world/' },
      { label: 'AP News', url: 'https://apnews.com/' },
    ];
  }

  return {
    bullets,
    sources,
    generatedAt: new Date().toISOString(),
    model: 'anthropic/claude-sonnet-4.6 (fixture)',
    warnings: [],
    degraded: false,
  };
}

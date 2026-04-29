/* SignalMap demo data
   Lon/lat are normalized to a flat equirectangular projection used by the SVG world map.
*/

// Categories with color, label, icon name (Material Symbols outlined)
window.SM_CATEGORIES = [
  { id: 'internet',    label: 'Internet Health', short: 'Internet',  color: 'var(--cat-internet)',    icon: 'public' },
  { id: 'provider',    label: 'Provider Status', short: 'Provider',  color: 'var(--cat-provider)',    icon: 'cloud' },
  { id: 'geopolitics', label: 'GeoPolitics',     short: 'Geopol',    color: 'var(--cat-geopolitics)', icon: 'flag' },
  { id: 'conflict',    label: 'Conflict',        short: 'Conflict',  color: 'var(--cat-conflict)',    icon: 'gpp_maybe' },
  { id: 'finance',     label: 'Finance',         short: 'Finance',   color: 'var(--cat-finance)',     icon: 'show_chart' },
  { id: 'technology',  label: 'Technology',      short: 'Tech',      color: 'var(--cat-technology)',  icon: 'memory' },
  { id: 'cyber',       label: 'Cyber',           short: 'Cyber',     color: 'var(--cat-cyber)',       icon: 'security' },
  { id: 'climate',     label: 'Climate',         short: 'Climate',   color: 'var(--cat-climate)',     icon: 'waves' },
  { id: 'health',      label: 'Health',          short: 'Health',    color: 'var(--cat-health)',      icon: 'medical_services' },
  { id: 'energy',      label: 'Energy',          short: 'Energy',    color: 'var(--cat-energy)',      icon: 'bolt' },
  { id: 'supply',      label: 'Supply Chain',    short: 'Supply',    color: 'var(--cat-supply)',      icon: 'inventory_2' },
  { id: 'infra',       label: 'Infrastructure',  short: 'Infra',     color: 'var(--cat-infra)',       icon: 'foundation' },
];

window.SM_REGIONS = [
  { id: 'global', label: 'Global' },
  { id: 'na', label: 'North America' },
  { id: 'eu', label: 'Europe' },
  { id: 'mena', label: 'MENA' },
  { id: 'apac', label: 'Asia-Pacific' },
  { id: 'sa', label: 'South Asia' },
  { id: 'af', label: 'Africa' },
  { id: 'latam', label: 'South America' },
  { id: 'azure-eus', label: 'Azure East US', kind: 'cloud' },
  { id: 'azure-weu', label: 'Azure West Europe', kind: 'cloud' },
  { id: 'azure-jpe', label: 'Azure Japan East', kind: 'cloud' },
  { id: 'wasabi-euw1', label: 'Wasabi EU-West-1', kind: 'cloud' },
  { id: 'wasabi-apse1', label: 'Wasabi AP-Southeast-1', kind: 'cloud' },
];

window.SM_PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare', short: 'CF' },
  { id: 'okta',       label: 'Okta',        short: 'OK' },
  { id: 'm365',       label: 'Microsoft 365', short: 'M365' },
  { id: 'azure',      label: 'Azure',       short: 'AZ' },
  { id: 'wasabi',     label: 'Wasabi',      short: 'WS' },
];

window.SM_SOURCES = [
  { id: 'radar', label: 'Cloudflare Radar', tier: 1, status: 'ok', latency: 42 },
  { id: 'cf-status', label: 'Cloudflare Status', tier: 1, status: 'ok', latency: 88 },
  { id: 'okta-status', label: 'Okta Status RSS', tier: 1, status: 'ok', latency: 121 },
  { id: 'm365-health', label: 'Microsoft Service Health', tier: 1, status: 'degraded', latency: 612 },
  { id: 'azure-status', label: 'Azure Status RSS', tier: 1, status: 'ok', latency: 198 },
  { id: 'wasabi-status', label: 'Wasabi Status', tier: 1, status: 'ok', latency: 304 },
  { id: 'gdelt', label: 'GDELT', tier: 2, status: 'ok', latency: 410 },
  { id: 'rss-tier1', label: 'RSS / Tier-1 News', tier: 1, status: 'ok', latency: 156 },
  { id: 'rss-tier2', label: 'RSS / Tier-2 News', tier: 2, status: 'stale', latency: 2400 },
  { id: 'usgs', label: 'USGS / Disaster', tier: 1, status: 'ok', latency: 91 },
  { id: 'noaa', label: 'NOAA / Climate', tier: 1, status: 'ok', latency: 102 },
];

// Static context layers — only render when an incident touches them.
window.SM_CONTEXT = {
  cables: [
    { id: 'sea-me-we-6', name: 'SEA-ME-WE 6', path: [[103.8, 1.3],[80.2, 13.0],[55.3, 25.3],[39.6, 24.5],[32.3, 31.2],[14.5, 40.8]] },
    { id: '2africa', name: '2Africa', path: [[18.4,-33.9],[3.1,6.5],[-17.4,14.7],[-9.1,38.7],[2.3,48.8]] },
    { id: 'transpacific', name: 'JUPITER', path: [[139.7,35.6],[-157.8,21.3],[-118.2,34.0]] },
  ],
  datacenters: [
    { id: 'azure-eus', name: 'Azure East US', lon: -78.4, lat: 38.0, provider: 'azure' },
    { id: 'azure-weu', name: 'Azure West Europe', lon: 4.9, lat: 52.4, provider: 'azure' },
    { id: 'wasabi-euw1', name: 'Wasabi EU-West-1', lon: -8.2, lat: 53.4, provider: 'wasabi' },
    { id: 'cf-fra', name: 'Cloudflare FRA', lon: 8.7, lat: 50.1, provider: 'cloudflare' },
  ],
};

/* SIGNALS — every signal is either an incident (has a map location) or contextless (provider feed only).
   t = minutes ago. severity: critical|major|minor|info. confidence 0..1.
*/
const NOW = Date.now();
const ago = (m) => NOW - m * 60 * 1000;

window.SM_SIGNALS = [
  // ===== INTERNET HEALTH (Cloudflare Radar) =====
  {
    id: 'rdr-pk-01',
    category: 'internet',
    severity: 'major',
    title: 'Cloudflare Radar detects traffic anomaly in Pakistan',
    summary: 'Radar reports a country-level traffic anomaly affecting multiple ASNs across Pakistan; HTTP request volume down ~38% versus baseline since 09:42 UTC.',
    locations: [{ name: 'Pakistan', lon: 69.3, lat: 30.4, scope: 'country' }],
    sources: [{ id: 'radar', label: 'Cloudflare Radar', verified: true }],
    asn: 'PTCL AS17557 + 4 others',
    cause: 'Under investigation',
    started: ago(74),
    confidence: 0.96,
    locConfidence: 0.99,
    corroboration: 1,
    region: 'sa',
    radarKind: 'anomaly',
    tags: ['country', 'http-drop', 'multi-ASN'],
    duration: '1h 14m',
  },
  {
    id: 'rdr-iq-01',
    category: 'internet',
    severity: 'critical',
    title: 'Regional internet disruption reported in southern Iraq',
    summary: 'Subnational outage in Basra Governorate. Radar shows near-zero HTTP traffic from regional ASNs since 06:18 UTC.',
    locations: [{ name: 'Basra, Iraq', lon: 47.8, lat: 30.5, scope: 'region' }],
    sources: [{ id: 'radar', label: 'Cloudflare Radar', verified: true }],
    asn: 'IQ Network AS59588',
    cause: 'Power infrastructure (reported)',
    started: ago(212),
    confidence: 0.92,
    locConfidence: 0.95,
    corroboration: 2,
    region: 'mena',
    radarKind: 'outage',
    tags: ['subnational', 'power'],
    duration: '3h 32m',
  },
  {
    id: 'rdr-sd-01',
    category: 'internet',
    severity: 'major',
    title: 'Sustained connectivity disruption observed in Sudan',
    summary: 'Country-wide HTTP traffic degraded ~62%. Pattern consistent with previous routing-level disruptions.',
    locations: [{ name: 'Sudan', lon: 30.2, lat: 15.5, scope: 'country' }],
    sources: [{ id: 'radar', label: 'Cloudflare Radar', verified: true }, { id: 'rss-tier1', label: 'Reuters' }],
    asn: 'Sudatel AS15706',
    cause: 'Network/routing',
    started: ago(1380),
    confidence: 0.94,
    locConfidence: 0.98,
    corroboration: 3,
    region: 'af',
    radarKind: 'outage',
    tags: ['country', 'sustained'],
    duration: '23h 0m',
  },
  {
    id: 'rdr-uk-01',
    category: 'internet',
    severity: 'minor',
    title: 'ASN-level routing anomaly observed on UK transit network',
    summary: 'Brief BGP instability affected a Tier-1 transit provider; partial recovery within 14 minutes. Radar flagged elevated path churn.',
    locations: [{ name: 'United Kingdom', lon: -2.4, lat: 53.5, scope: 'asn' }],
    sources: [{ id: 'radar', label: 'Cloudflare Radar', verified: true }],
    asn: 'AS2856',
    cause: 'BGP path churn',
    started: ago(36),
    confidence: 0.81,
    locConfidence: 0.82,
    corroboration: 1,
    region: 'eu',
    radarKind: 'anomaly',
    tags: ['ASN', 'BGP'],
    duration: '14m',
    watchlistMatch: true,
  },

  // ===== PROVIDER STATUS =====
  {
    id: 'prv-cf-01',
    category: 'provider',
    severity: 'major',
    title: 'Cloudflare Status reports degraded Workers performance',
    summary: 'Cloudflare is investigating elevated error rates and increased latency for Workers and Workers KV in select colos. Mitigations in progress.',
    locations: [{ name: 'Global (multi-colo)', scope: 'provider' }],
    sources: [{ id: 'cf-status', label: 'Cloudflare Status', verified: true }],
    provider: 'cloudflare',
    incidentStatus: 'investigating',
    impact: 'Degraded performance',
    started: ago(28),
    confidence: 0.99,
    locConfidence: 0.4, // contextless / no map dot
    corroboration: 1,
    tags: ['Workers', 'KV'],
    duration: '28m',
  },
  {
    id: 'prv-okta-01',
    category: 'provider',
    severity: 'major',
    title: 'Okta reports elevated sign-in error rates',
    summary: 'Okta is investigating elevated 5xx errors on the authentication endpoint affecting a subset of cells. Engineers are engaged.',
    locations: [{ name: 'Okta cells (multi-region)', scope: 'provider' }],
    sources: [{ id: 'okta-status', label: 'Okta Status RSS', verified: true }],
    provider: 'okta',
    incidentStatus: 'identified',
    impact: 'Partial outage',
    started: ago(52),
    confidence: 0.98,
    locConfidence: 0.3,
    corroboration: 1,
    tags: ['auth', '5xx'],
    duration: '52m',
  },
  {
    id: 'prv-az-weu-01',
    category: 'provider',
    severity: 'major',
    title: 'Azure reports service management issues in West Europe',
    summary: 'Customers may experience failures when performing service management operations. Resource Manager calls timing out for a subset of subscriptions.',
    locations: [{ name: 'Azure West Europe', lon: 4.9, lat: 52.4, scope: 'cloud-region' }],
    sources: [{ id: 'azure-status', label: 'Azure Status RSS', verified: true }],
    provider: 'azure',
    incidentStatus: 'investigating',
    impact: 'Degraded performance',
    started: ago(94),
    confidence: 0.99,
    locConfidence: 0.99,
    corroboration: 1,
    region: 'eu',
    tags: ['ARM', 'control-plane'],
    duration: '1h 34m',
    watchlistMatch: true,
  },
  {
    id: 'prv-ws-usw1-01',
    category: 'provider',
    severity: 'minor',
    title: 'Wasabi US-West-1 reports degraded S3 API performance',
    summary: 'Wasabi engineers observe elevated PUT latency in US-West-1. Read traffic unaffected. Mitigations rolling out.',
    locations: [{ name: 'Wasabi US-West-1', lon: -120.5, lat: 38.6, scope: 'cloud-region' }],
    sources: [{ id: 'wasabi-status', label: 'Wasabi Status', verified: true }],
    provider: 'wasabi',
    incidentStatus: 'monitoring',
    impact: 'Degraded performance',
    started: ago(168),
    confidence: 0.95,
    locConfidence: 0.95,
    corroboration: 1,
    region: 'na',
    tags: ['S3', 'PUT-latency'],
    duration: '2h 48m',
  },
  {
    id: 'prv-m365-01',
    category: 'provider',
    severity: 'minor',
    title: 'Microsoft 365 — Teams meetings degraded for some EMEA users',
    summary: 'A subset of users in EMEA may experience join failures or audio drops. Microsoft is rerouting traffic.',
    locations: [{ name: 'EMEA (subset)', scope: 'provider' }],
    sources: [{ id: 'm365-health', label: 'Microsoft Service Health', verified: true }],
    provider: 'm365',
    incidentStatus: 'mitigating',
    impact: 'Partial outage',
    started: ago(140),
    confidence: 0.92,
    locConfidence: 0.45,
    corroboration: 1,
    region: 'eu',
    tags: ['Teams', 'EMEA'],
    duration: '2h 20m',
    watchlistMatch: true,
  },

  // ===== GEOPOLITICS / NEWS =====
  {
    id: 'geo-tw-01',
    category: 'supply',
    severity: 'major',
    title: 'Taiwan chip suppliers reroute shipments after port disruption',
    summary: 'Multiple suppliers shifted air freight from Kaohsiung after port operations slowed; logistics partners cite 36–48h delay on advanced packaging exports.',
    locations: [{ name: 'Kaohsiung, Taiwan', lon: 120.3, lat: 22.6, scope: 'city' }],
    sources: [
      { id: 'rss-tier1', label: 'Reuters' },
      { id: 'rss-tier1', label: 'Nikkei' },
      { id: 'gdelt', label: 'GDELT' },
    ],
    started: ago(186),
    confidence: 0.84,
    locConfidence: 0.91,
    corroboration: 4,
    region: 'apac',
    tags: ['semiconductors', 'logistics', 'export'],
  },
  {
    id: 'fin-cb-01',
    category: 'finance',
    severity: 'minor',
    title: 'Central bank surprise cut pressures regional currencies',
    summary: 'An unexpected 50bp policy rate cut weakened the local currency; regional FX pairs adjusted within minutes of the announcement.',
    locations: [{ name: 'Jakarta, Indonesia', lon: 106.8, lat: -6.2, scope: 'city' }],
    sources: [{ id: 'rss-tier1', label: 'Bloomberg' }, { id: 'gdelt', label: 'GDELT' }],
    started: ago(310),
    confidence: 0.78,
    locConfidence: 0.88,
    corroboration: 3,
    region: 'apac',
    tags: ['monetary-policy', 'FX'],
  },
  {
    id: 'cyb-eu-01',
    category: 'cyber',
    severity: 'major',
    title: 'Cyber campaign targets energy operators in Eastern Europe',
    summary: 'Coordinated phishing + credential stuffing campaign tracked across at least three transmission operators. CERT advisories issued.',
    locations: [{ name: 'Eastern Europe', lon: 25.0, lat: 49.0, scope: 'region' }],
    sources: [{ id: 'rss-tier1', label: 'Recorded Future' }, { id: 'rss-tier2', label: 'BleepingComputer' }],
    started: ago(420),
    confidence: 0.71,
    locConfidence: 0.66,
    corroboration: 2,
    region: 'eu',
    tags: ['phishing', 'energy', 'CERT'],
    watchlistMatch: true,
  },
  {
    id: 'cli-it-01',
    category: 'climate',
    severity: 'minor',
    title: 'Flooding disrupts rail freight near Milan',
    summary: 'Heavy rainfall caused embankment damage on a freight corridor north of Milan; reroute via Verona adds 4–6h transit time.',
    locations: [{ name: 'Milan, Italy', lon: 9.2, lat: 45.5, scope: 'city' }],
    sources: [{ id: 'noaa', label: 'NOAA' }, { id: 'rss-tier1', label: 'Reuters' }],
    started: ago(86),
    confidence: 0.86,
    locConfidence: 0.94,
    corroboration: 2,
    region: 'eu',
    tags: ['rail', 'flooding', 'logistics'],
    watchlistMatch: true,
  },
  {
    id: 'tech-us-01',
    category: 'technology',
    severity: 'major',
    title: 'New export controls hit advanced AI accelerators',
    summary: 'Updated controls expand the licensing requirement for high-bandwidth memory and several accelerator SKUs to additional jurisdictions.',
    locations: [{ name: 'Washington, D.C.', lon: -77.0, lat: 38.9, scope: 'city' }],
    sources: [{ id: 'rss-tier1', label: 'Reuters' }, { id: 'rss-tier1', label: 'WSJ' }],
    started: ago(540),
    confidence: 0.88,
    locConfidence: 0.97,
    corroboration: 5,
    region: 'na',
    tags: ['export-controls', 'AI', 'policy'],
    watchlistMatch: true,
  },
  {
    id: 'geo-ua-01',
    category: 'geopolitics',
    severity: 'major',
    title: 'Drone strikes reported on energy infrastructure in southern Ukraine',
    summary: 'Multiple regional outlets report strikes on substations near Odesa; ENTSO-E flags possible cross-border load impact.',
    locations: [{ name: 'Odesa Oblast', lon: 30.7, lat: 46.5, scope: 'region' }],
    sources: [{ id: 'rss-tier1', label: 'Reuters' }, { id: 'gdelt', label: 'GDELT' }],
    started: ago(112),
    confidence: 0.83,
    locConfidence: 0.90,
    corroboration: 4,
    region: 'eu',
    tags: ['energy', 'conflict-adjacent'],
    watchlistMatch: true,
  },
  {
    id: 'cli-ph-01',
    category: 'climate',
    severity: 'major',
    title: 'Tropical cyclone strengthens off Luzon',
    summary: 'PAGASA upgraded the storm to Category 3 equivalent; landfall expected within 36 hours. Maritime advisories in effect.',
    locations: [{ name: 'Luzon, Philippines', lon: 121.0, lat: 16.6, scope: 'region' }],
    sources: [{ id: 'noaa', label: 'NOAA' }, { id: 'rss-tier1', label: 'AFP' }],
    started: ago(260),
    confidence: 0.93,
    locConfidence: 0.97,
    corroboration: 3,
    region: 'apac',
    tags: ['cyclone', 'maritime'],
  },

  // Low confidence — gets surfaced in feed but NOT pinned to a marker
  {
    id: 'low-01',
    category: 'cyber',
    severity: 'minor',
    title: 'Unattributed ransomware claim targeting unspecified European retailer',
    summary: 'Leak-site post claims compromise of a "major European retailer". No confirmed victim identification; geo-extraction failed confidence threshold.',
    locations: [],
    sources: [{ id: 'rss-tier2', label: 'DarkOwl' }],
    started: ago(48),
    confidence: 0.41,
    locConfidence: 0.22,
    corroboration: 1,
    region: 'eu',
    tags: ['ransomware', 'unverified'],
    lowConfidence: true,
  },
];

// Velocity buckets: signals per 15-min slot over last 24h, by category.
// Used by the timeline strip. Generated to look realistic.
window.SM_VELOCITY = (() => {
  const slots = 96; // 24h × 4
  const cats = ['internet','provider','geopolitics','finance','technology','cyber','climate','energy','supply','infra','health','conflict'];
  const out = [];
  for (let i = 0; i < slots; i++) {
    const row = { t: i };
    cats.forEach(c => {
      // base + sinusoidal + spike near recent slots
      const base = 0.3 + Math.random() * 0.6;
      const wave = Math.sin((i / slots) * Math.PI * 2 + cats.indexOf(c)) * 0.5;
      const recent = i > slots - 12 ? Math.random() * 2 : 0;
      row[c] = Math.max(0, base + wave + recent);
    });
    out.push(row);
  }
  // boost most recent for internet (the radar disruption)
  for (let i = slots - 8; i < slots; i++) {
    out[i].internet += 1.5 + Math.random();
    out[i].provider += 0.8 + Math.random();
  }
  return out;
})();

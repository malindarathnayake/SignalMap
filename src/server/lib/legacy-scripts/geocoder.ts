import {
  createCountryResolvers,
  isIso2,
  loadSharedConfig,
  normalizeCountryToken,
  resolveIso2,
} from './shared';

export const DEFAULT_SIGNALMAP_LOCATION_CONFIDENCE_MIN = 0.7;

const COUNTRY_BBOXES: Record<string, [number, number, number, number]> =
  loadSharedConfig('country-bboxes.json');
const COUNTRY_NAMES: Record<string, string> = loadSharedConfig('country-names.json');
const ISO3_TO_ISO2: Record<string, string> = loadSharedConfig('iso3-to-iso2.json');
const COUNTRY_RESOLVERS = createCountryResolvers(COUNTRY_NAMES, ISO3_TO_ISO2);
const KNOWN_ISO2 = new Set<string>(
  [
    ...Object.values(COUNTRY_NAMES),
    ...Object.values(ISO3_TO_ISO2),
    ...Object.keys(COUNTRY_BBOXES),
  ]
    .map((value) => String(value).toUpperCase())
    .filter(isIso2),
);

interface StaticPlace {
  name: string;
  aliases?: string[];
  countryIso2: string;
  scope: 'city' | 'region' | 'country';
  lat: number;
  lon: number;
}

export const SIGNALMAP_STATIC_PLACES: StaticPlace[] = [
  { name: 'Kyiv', aliases: ['Kiev'], countryIso2: 'UA', scope: 'city', lat: 50.4501, lon: 30.5234 },
  { name: 'Berlin', countryIso2: 'DE', scope: 'city', lat: 52.52, lon: 13.405 },
  { name: 'London', countryIso2: 'GB', scope: 'city', lat: 51.5072, lon: -0.1276 },
  { name: 'Paris', countryIso2: 'FR', scope: 'city', lat: 48.8566, lon: 2.3522 },
  { name: 'Tokyo', countryIso2: 'JP', scope: 'city', lat: 35.6762, lon: 139.6503 },
  { name: 'Singapore', countryIso2: 'SG', scope: 'city', lat: 1.3521, lon: 103.8198 },
  { name: 'Kerala', countryIso2: 'IN', scope: 'region', lat: 10.8505, lon: 76.2711 },
  { name: 'Golders Green', countryIso2: 'GB', scope: 'city', lat: 51.5722, lon: -0.1941 },
  {
    name: 'New York',
    aliases: ['New York City', 'NYC'],
    countryIso2: 'US',
    scope: 'city',
    lat: 40.7128,
    lon: -74.006,
  },
  {
    name: 'Washington DC',
    aliases: ['Washington', 'Washington, DC', 'Washington D.C.'],
    countryIso2: 'US',
    scope: 'city',
    lat: 38.9072,
    lon: -77.0369,
  },
  {
    name: 'Silicon Valley',
    countryIso2: 'US',
    scope: 'region',
    lat: 37.3875,
    lon: -122.0575,
  },
  {
    name: 'US East',
    aliases: ['U.S. East', 'United States East', 'US-EAST-1'],
    countryIso2: 'US',
    scope: 'region',
    lat: 39.0438,
    lon: -77.4874,
  },
  {
    name: 'Georgia',
    aliases: ['State of Georgia'],
    countryIso2: 'US',
    scope: 'region',
    lat: 32.1656,
    lon: -82.9001,
  },
  { name: 'Georgia', countryIso2: 'GE', scope: 'country', lat: 42.325, lon: 43.21 },
];

const AMBIGUOUS_LOCATION_NAMES = new Set<string>([
  'georgia',
  'springfield',
  'washington',
  'paris',
  'london',
]);

const TEXTUAL_COUNTRY_TOKENS = new Map<string, string>([
  ['u s', 'US'],
  ['u s a', 'US'],
  ['u k', 'GB'],
]);

function finiteNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function normalizePlaceName(value: string | undefined): string {
  return normalizeCountryToken(value);
}

function normalizeIso2(value: string | undefined): string | null {
  const iso2 = String(value || '').trim().toUpperCase();
  return isIso2(iso2) && KNOWN_ISO2.has(iso2) ? iso2 : null;
}

function readConfidenceMin(options: { confidenceMin?: number | string }): number {
  const raw = options.confidenceMin ?? process.env.SIGNALMAP_LOCATION_CONFIDENCE_MIN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_SIGNALMAP_LOCATION_CONFIDENCE_MIN;
}

function buildStaticPlaceIndex(places: StaticPlace[]) {
  const byNameAndCountry = new Map<string, StaticPlace>();
  const byName = new Map<string, StaticPlace[]>();

  for (const place of places) {
    const iso2 = normalizeIso2(place.countryIso2);
    if (!iso2 || !finiteNumber(place.lat) || !finiteNumber(place.lon)) continue;

    for (const name of [place.name, ...(place.aliases || [])]) {
      const normalizedName = normalizePlaceName(name);
      if (!normalizedName) continue;
      const key = `${normalizedName}|${iso2}`;
      if (!byNameAndCountry.has(key)) byNameAndCountry.set(key, { ...place, countryIso2: iso2 });

      const existing = byName.get(normalizedName);
      if (!existing) {
        byName.set(normalizedName, [{ ...place, countryIso2: iso2 }]);
      } else {
        existing.push({ ...place, countryIso2: iso2 });
      }
    }
  }

  return { byNameAndCountry, byName };
}

const STATIC_PLACE_INDEX = buildStaticPlaceIndex(SIGNALMAP_STATIC_PLACES);

export function countryBboxCentroid(
  bbox: [number, number, number, number],
): { lat: number; lon: number } | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [south, west, north, east] = bbox.map(Number);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  return {
    lat: roundCoordinate((south + north) / 2),
    lon: roundCoordinate((west + east) / 2),
  };
}

function resolveKnownIso2(
  input: { iso2?: string; iso3?: string; name?: string },
  resolvers = COUNTRY_RESOLVERS,
): string | null {
  const iso2 = resolveIso2(input, resolvers);
  return normalizeIso2(iso2);
}

export function resolveSignalMapCountryIso2(
  location: any,
  options: { resolvers?: any } = {},
): string | null {
  const resolvers = options.resolvers ?? COUNTRY_RESOLVERS;
  const directIso2 = normalizeIso2(location?.countryIso2);
  if (directIso2) return directIso2;

  const fromCountryName =
    resolveKnownIso2({ name: location?.countryName }, resolvers) ||
    resolveKnownIso2({ name: location?.country }, resolvers);
  if (fromCountryName) return fromCountryName;

  const fromIso3 = resolveKnownIso2({ iso3: location?.iso3 }, resolvers);
  if (fromIso3) return fromIso3;

  return resolveKnownIso2({ name: location?.name }, resolvers);
}

function resolveExplicitCountryEvidence(location: any, resolvers: any): string | null {
  return (
    normalizeIso2(location?.countryIso2) ||
    resolveKnownIso2({ name: location?.countryName }, resolvers) ||
    resolveKnownIso2({ name: location?.country }, resolvers) ||
    resolveKnownIso2({ iso3: location?.iso3 }, resolvers)
  );
}

function resolveExplicitTextualCountryEvidence(location: any, resolvers: any): string | null {
  return (
    resolveKnownIso2({ name: location?.countryName }, resolvers) ||
    resolveKnownIso2({ name: location?.country }, resolvers)
  );
}

function resolveEvidenceTextCountryIso2(location: any, resolvers: any): string | null {
  const evidence = typeof location?.evidence === 'string' ? location.evidence : '';
  if (!evidence.trim()) return null;

  const normalizedEvidence = ` ${normalizeCountryToken(evidence)} `;
  const normalizedLocationName = normalizePlaceName(location?.name);

  for (const [token, iso2] of TEXTUAL_COUNTRY_TOKENS.entries()) {
    if (normalizedEvidence.includes(` ${token} `)) return iso2;
  }

  const countryNameEntries = [...resolvers.nameToIso2.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );

  for (const [countryName, iso2] of countryNameEntries) {
    if (countryName.length < 3) continue;
    const knownIso2 = normalizeIso2(iso2);
    if (
      knownIso2 &&
      countryName === normalizedLocationName &&
      normalizedEvidence.includes(` country of ${countryName} `)
    ) {
      return knownIso2;
    }
    if (countryName === normalizedLocationName) continue;
    if (knownIso2 && normalizedEvidence.includes(` ${countryName} `)) return knownIso2;
  }

  for (const match of evidence.matchAll(/\b[A-Z]{2}\b/g)) {
    const knownIso2 = normalizeIso2(match[0]);
    if (knownIso2) return knownIso2;
  }

  return null;
}

function resolveCountryEvidenceIso2(location: any, options: { resolvers?: any } = {}): string | null {
  const resolvers = options.resolvers ?? COUNTRY_RESOLVERS;
  return (
    resolveExplicitCountryEvidence(location, resolvers) ||
    resolveEvidenceTextCountryIso2(location, resolvers)
  );
}

function resolveTextualCountryEvidenceIso2(
  location: any,
  options: { resolvers?: any } = {},
): string | null {
  const resolvers = options.resolvers ?? COUNTRY_RESOLVERS;
  return (
    resolveExplicitTextualCountryEvidence(location, resolvers) ||
    resolveEvidenceTextCountryIso2(location, resolvers)
  );
}

function findStaticPlace(
  location: any,
  countryIso2: string | null,
  options: { staticPlaces?: StaticPlace[] } = {},
): StaticPlace | null {
  const places = options.staticPlaces ?? SIGNALMAP_STATIC_PLACES;
  const index =
    places === SIGNALMAP_STATIC_PLACES ? STATIC_PLACE_INDEX : buildStaticPlaceIndex(places);
  const normalizedName = normalizePlaceName(location?.name);
  if (!normalizedName) return null;

  if (countryIso2) {
    return index.byNameAndCountry.get(`${normalizedName}|${countryIso2}`) || null;
  }

  const matches = index.byName.get(normalizedName) || [];
  return matches.length === 1 ? matches[0] : null;
}

function markerEligibleFor(location: any, confidenceMin: number): boolean {
  return (
    finiteNumber(location.lat) &&
    finiteNumber(location.lon) &&
    finiteNumber(location.confidence) &&
    location.confidence >= confidenceMin
  );
}

function unresolvedLocation(location: any, geocodeStatus: string, extra = {}): any {
  const { lat, lon, ...rest } = location || {};
  return {
    ...rest,
    ...extra,
    geocodeStatus,
    markerEligible: false,
  };
}

export function resolveSignalMapLocation(location: any, options: any = {}): any {
  const confidenceMin = readConfidenceMin(options);
  const normalizedName = normalizePlaceName(location?.name);
  const textualCountryEvidenceIso2 = resolveTextualCountryEvidenceIso2(location, options);

  if (AMBIGUOUS_LOCATION_NAMES.has(normalizedName) && !textualCountryEvidenceIso2) {
    return unresolvedLocation(location, 'ambiguous_location');
  }

  const countryEvidenceIso2 =
    textualCountryEvidenceIso2 || resolveCountryEvidenceIso2(location, options);
  const countryIso2 = countryEvidenceIso2 || resolveSignalMapCountryIso2(location, options);
  const staticPlace = findStaticPlace(location, countryIso2, options);
  if (staticPlace) {
    const resolved = {
      ...location,
      name: location?.name ?? staticPlace.name,
      countryIso2: staticPlace.countryIso2,
      scope: staticPlace.scope,
      lat: staticPlace.lat,
      lon: staticPlace.lon,
      geocodeStatus: 'resolved_static',
    };
    return {
      ...resolved,
      markerEligible: markerEligibleFor(resolved, confidenceMin),
    };
  }

  const nameCountryIso2 = resolveKnownIso2(
    { name: location?.name },
    options.resolvers ?? COUNTRY_RESOLVERS,
  );
  const countryOnly =
    location?.scope === 'country' || (nameCountryIso2 && nameCountryIso2 === countryIso2);
  const countryBboxes = options.countryBboxes ?? COUNTRY_BBOXES;
  const countryCentroid = countryOnly ? countryBboxCentroid(countryBboxes[countryIso2]) : null;
  if (countryCentroid) {
    const resolved = {
      ...location,
      countryIso2,
      scope: 'country',
      lat: countryCentroid.lat,
      lon: countryCentroid.lon,
      geocodeStatus: 'resolved_country',
    };
    return {
      ...resolved,
      markerEligible: markerEligibleFor(resolved, confidenceMin),
    };
  }

  return unresolvedLocation(location, 'unresolved_location', countryIso2 ? { countryIso2 } : {});
}

export function resolveSignalMapLocations(locations: any[], options = {}): any[] {
  if (!Array.isArray(locations)) return [];
  return locations.map((location) => resolveSignalMapLocation(location, options));
}

import type {
  SignalMapCategory,
  SignalMapKnownProvider,
  SignalMapProviderConfig,
  SignalMapRegionGroup,
  SignalMapRegionGroupConfig,
  SignalMapSeverity,
} from '@/types/signalmap';

export const SIGNALMAP_CATEGORIES = [
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
] as const satisfies readonly SignalMapCategory[];

export const SIGNALMAP_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const satisfies readonly SignalMapSeverity[];

export const SIGNALMAP_PROVIDERS = {
  cloudflare: { id: 'cloudflare', label: 'Cloudflare', category: 'internet' },
  okta: { id: 'okta', label: 'Okta', category: 'provider' },
  m365: { id: 'm365', label: 'Microsoft 365', category: 'provider' },
  azure: { id: 'azure', label: 'Microsoft Azure', category: 'provider' },
  wasabi: { id: 'wasabi', label: 'Wasabi', category: 'provider' },
} as const satisfies Record<
  SignalMapKnownProvider,
  SignalMapProviderConfig
>;

export const SIGNALMAP_REGION_GROUPS = {
  na: { id: 'na', label: 'North America', countryIso2: ['CA', 'MX', 'US'] },
  eu: {
    id: 'eu',
    label: 'Europe',
    countryIso2: ['AT', 'BE', 'DE', 'ES', 'FR', 'GB', 'IE', 'IT', 'NL', 'PL', 'SE'],
  },
  latam: { id: 'latam', label: 'Latin America', countryIso2: ['AR', 'BR', 'CL', 'CO', 'PE'] },
  mena: { id: 'mena', label: 'Middle East and North Africa', countryIso2: ['AE', 'EG', 'IL', 'MA', 'SA', 'TR'] },
  africa: { id: 'africa', label: 'Sub-Saharan Africa', countryIso2: ['ET', 'KE', 'NG', 'ZA'] },
  apac: { id: 'apac', label: 'Asia Pacific', countryIso2: ['AU', 'CN', 'ID', 'IN', 'JP', 'KR', 'SG'] },
  global: { id: 'global', label: 'Global', countryIso2: [] },
} as const satisfies Record<SignalMapRegionGroup, SignalMapRegionGroupConfig>;

export type SignalMapProviderId = keyof typeof SIGNALMAP_PROVIDERS;
export type SignalMapRegionGroupId = keyof typeof SIGNALMAP_REGION_GROUPS;

export const SIGNALMAP_STORAGE_KEYS = {
  watchRegions: 'signalmap-watch-regions',
  watchProviders: 'signalmap-watch-providers',
  activeCategories: 'signalmap-active-categories',
  llmModel: 'signalmap-llm-model',
} as const;

export const SIGNALMAP_DEFAULT_WATCH_REGIONS = ['na', 'eu'] as const satisfies readonly SignalMapRegionGroupId[];

export const SIGNALMAP_DEFAULT_WATCH_PROVIDERS = [
  'cloudflare',
  'azure',
  'm365',
] as const satisfies readonly SignalMapProviderId[];

export const SIGNALMAP_DEFAULT_ACTIVE_CATEGORIES = SIGNALMAP_CATEGORIES;

export const SIGNALMAP_DEFAULT_LLM_MODEL = 'server-default';

export const SIGNALMAP_LOCATION_CONFIDENCE_MIN = 0.7;

const signalMapCategorySet = new Set<string>(SIGNALMAP_CATEGORIES);
const signalMapSeveritySet = new Set<string>(SIGNALMAP_SEVERITIES);
const signalMapProviderSet = new Set<string>(Object.keys(SIGNALMAP_PROVIDERS));
const signalMapRegionGroupSet = new Set<string>(Object.keys(SIGNALMAP_REGION_GROUPS));

export function isSignalMapCategory(value: string): value is SignalMapCategory {
  return signalMapCategorySet.has(value);
}

export function isSignalMapSeverity(value: string): value is SignalMapSeverity {
  return signalMapSeveritySet.has(value);
}

export function isSignalMapProviderId(value: string): value is SignalMapProviderId {
  return signalMapProviderSet.has(value);
}

export function isSignalMapRegionGroupId(value: string): value is SignalMapRegionGroupId {
  return signalMapRegionGroupSet.has(value);
}

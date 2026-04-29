export type SignalMapCategory =
  | 'internet'
  | 'provider'
  | 'technology'
  | 'finance'
  | 'geopolitics'
  | 'conflict'
  | 'cyber'
  | 'climate'
  | 'health'
  | 'energy'
  | 'supply_chain'
  | 'infrastructure';

export type SignalMapSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SignalMapLocationScope =
  | 'city'
  | 'region'
  | 'country'
  | 'network'
  | 'provider'
  | 'unknown';

export interface SignalMapLocation {
  name: string;
  countryIso2?: string;
  lat?: number;
  lon?: number;
  scope: SignalMapLocationScope;
  confidence: number;
  evidence?: string;
}

export interface SignalMapSource {
  id: string;
  label: string;
  url?: string;
  tier?: number;
  verified?: boolean;
  fetchedAt?: string;
}

export type SignalMapKnownProvider = 'cloudflare' | 'okta' | 'm365' | 'azure' | 'wasabi';

export type SignalMapProvider = SignalMapKnownProvider | (string & {});

export type SignalMapRegionGroup =
  | 'na'
  | 'eu'
  | 'latam'
  | 'mena'
  | 'africa'
  | 'apac'
  | 'global';

export interface SignalMapProviderConfig {
  id: SignalMapKnownProvider;
  label: string;
  category: SignalMapCategory;
}

export interface SignalMapRegionGroupConfig {
  id: SignalMapRegionGroup;
  label: string;
  countryIso2: readonly string[];
}

export type SignalMapKind = 'radar_outage' | 'radar_anomaly' | 'provider_status' | 'story';

export interface SignalMapEvent {
  id: string;
  category: SignalMapCategory;
  severity: SignalMapSeverity;
  title: string;
  summary: string;
  tags: string[];
  startedAt?: string;
  endedAt?: string;
  lastObservedAt: string;
  locations: SignalMapLocation[];
  sources: SignalMapSource[];
  confidence: number;
  provider?: SignalMapProvider;
  kind: SignalMapKind;
  watchlistMatch: boolean;
  markerEligible: boolean;
}

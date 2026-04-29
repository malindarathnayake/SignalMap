import { signal } from '@preact/signals';
import { persist } from './persist.ts';

export type CameraRegion = 'iran' | 'middle-east' | 'europe' | 'asia' | 'americas' | 'space';

export interface CameraFeed {
  id: string;
  city: string;
  country: string;
  region: CameraRegion;
  videoId: string; // YouTube live video id
}

// Ported verbatim from legacy LiveWebcamsPanel.ts (worldmonitor v1).
// Verified Feb 2026 — IDs may rotate; replace via the cog → options dialog
// if a stream goes dead.
export const CAMERA_CATALOG: CameraFeed[] = [
  { id: 'iran-tehran',    city: 'Tehran',         country: 'Iran',          region: 'iran',        videoId: '-zGuR1qVKrU' },
  { id: 'iran-telaviv',   city: 'Tel Aviv',       country: 'Israel',        region: 'iran',        videoId: 'gmtlJ_m2r5A' },
  { id: 'iran-jerusalem', city: 'Jerusalem',      country: 'Israel',        region: 'iran',        videoId: 'fIurYTprwzg' },
  { id: 'iran-multicam',  city: 'Middle East',    country: 'Multi',         region: 'iran',        videoId: 'KSwPNkzEgxg' },
  { id: 'jerusalem',      city: 'Jerusalem',      country: 'Israel',        region: 'middle-east', videoId: 'e34xb-Fbl0U' },
  { id: 'tehran',         city: 'Tehran',         country: 'Iran',          region: 'middle-east', videoId: '-zGuR1qVKrU' },
  { id: 'tel-aviv',       city: 'Tel Aviv',       country: 'Israel',        region: 'middle-east', videoId: 'gmtlJ_m2r5A' },
  { id: 'mecca',          city: 'Mecca',          country: 'Saudi Arabia',  region: 'middle-east', videoId: 'kJwEsQTegxk' },
  { id: 'beirut-mtv',     city: 'Beirut',         country: 'Lebanon',       region: 'middle-east', videoId: 'djF-Lkgfp6k' },
  { id: 'kyiv',           city: 'Kyiv',           country: 'Ukraine',       region: 'europe',      videoId: '-Q7FuPINDjA' },
  { id: 'odessa',         city: 'Odessa',         country: 'Ukraine',       region: 'europe',      videoId: 'e2gC37ILQmk' },
  { id: 'paris',          city: 'Paris',          country: 'France',        region: 'europe',      videoId: 'OzYp4NRZlwQ' },
  { id: 'st-petersburg',  city: 'St. Petersburg', country: 'Russia',        region: 'europe',      videoId: 'CjtIYbmVfck' },
  { id: 'london',         city: 'London',         country: 'UK',            region: 'europe',      videoId: 'Lxqcg1qt0XU' },
  { id: 'washington',     city: 'Washington DC',  country: 'USA',           region: 'americas',    videoId: '1wV9lLe14aU' },
  { id: 'new-york',       city: 'New York',       country: 'USA',           region: 'americas',    videoId: '4qyZLflp-sI' },
  { id: 'los-angeles',    city: 'Los Angeles',    country: 'USA',           region: 'americas',    videoId: 'EO_1LWqsCNE' },
  { id: 'miami',          city: 'Miami',          country: 'USA',           region: 'americas',    videoId: '5YCajRjvWCg' },
  { id: 'taipei',         city: 'Taipei',         country: 'Taiwan',        region: 'asia',        videoId: 'z_fY1pj1VBw' },
  { id: 'shanghai',       city: 'Shanghai',       country: 'China',         region: 'asia',        videoId: '76EwqI5XZIc' },
  { id: 'tokyo',          city: 'Tokyo',          country: 'Japan',         region: 'asia',        videoId: '_k-5U7IeK8g' },
  { id: 'seoul',          city: 'Seoul',          country: 'South Korea',   region: 'asia',        videoId: '-JhoMGoAfFc' },
  { id: 'sydney',         city: 'Sydney',         country: 'Australia',     region: 'asia',        videoId: '7pcL-0Wo77U' },
  { id: 'iss-earth',      city: 'ISS Earth View', country: 'Space',         region: 'space',       videoId: 'vytmBNhc9ig' },
  { id: 'nasa-live',      city: 'NASA TV',        country: 'Space',         region: 'space',       videoId: 'zPH5KtjJFaQ' },
  { id: 'space-x',        city: 'SpaceX',         country: 'Space',         region: 'space',       videoId: 'fO9e9jnhYK8' },
];

export const ALL_CAMERA_REGIONS: CameraRegion[] = ['iran', 'middle-east', 'europe', 'americas', 'asia', 'space'];
export const REGION_LABEL: Record<CameraRegion, string> = {
  'iran': 'Iran / Israel',
  'middle-east': 'Middle East',
  'europe': 'Europe',
  'americas': 'Americas',
  'asia': 'Asia-Pacific',
  'space': 'Space',
};

export type CameraLayout = 1 | 2 | 4;

export interface CameraPrefs {
  layout: CameraLayout;
  cells: (string | null)[]; // length 4; ids null => empty cell
  muted: boolean;
}

export const DEFAULT_CAMERA_PREFS: CameraPrefs = {
  layout: 4,
  cells: ['iran-tehran', 'iran-telaviv', 'kyiv', 'taipei'],
  muted: true,
};

export const cameraPrefs = persist(
  signal<CameraPrefs>(DEFAULT_CAMERA_PREFS),
  'signalmap-camera-prefs',
);

export type BottomPanelTab = 'feed' | 'cameras';
export const bottomPanelTab = persist(
  signal<BottomPanelTab>('feed'),
  'signalmap-bottom-panel-tab',
);

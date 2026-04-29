/**
 * Shared zod schemas for the SignalMap HTTP API.
 * Each component schema calls .openapi({ ref: '<Name>' }) so it lands in
 * components.schemas rather than being inlined everywhere.
 */

import 'zod-openapi/extend';
import { z } from 'zod';

export const SignalMapCategory = z
  .enum([
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
  ])
  .openapi({ ref: 'SignalMapCategory' });

export const SignalMapSeverity = z
  .enum(['critical', 'high', 'medium', 'low', 'info'])
  .openapi({ ref: 'SignalMapSeverity' });

export const SignalMapLocationScope = z
  .enum(['city', 'region', 'country', 'network', 'provider', 'unknown'])
  .openapi({ ref: 'SignalMapLocationScope' });

export const SignalMapKind = z
  .enum(['radar_outage', 'radar_anomaly', 'provider_status', 'story'])
  .openapi({ ref: 'SignalMapKind' });

export const SignalMapLocation = z
  .object({
    name: z.string(),
    countryIso2: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    scope: SignalMapLocationScope,
    confidence: z.number(),
    evidence: z.string().optional(),
  })
  .openapi({ ref: 'SignalMapLocation' });

export const SignalMapSource = z
  .object({
    id: z.string(),
    label: z.string(),
    url: z.string().optional(),
    tier: z.number().int().optional(),
    verified: z.boolean().optional(),
    fetchedAt: z.string().optional(),
  })
  .openapi({ ref: 'SignalMapSource' });

export const SignalMapEvent = z
  .object({
    id: z.string(),
    category: SignalMapCategory,
    severity: SignalMapSeverity,
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    lastObservedAt: z.string(),
    locations: z.array(SignalMapLocation),
    sources: z.array(SignalMapSource),
    confidence: z.number(),
    provider: z.string().optional(),
    kind: SignalMapKind,
    watchlistMatch: z.boolean(),
    markerEligible: z.boolean(),
  })
  .openapi({ ref: 'SignalMapEvent' });

export const SignalMapSourceHealth = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(['ok', 'degraded', 'unavailable']),
    fetchedAt: z.number(),
    eventCount: z.number().int(),
    detail: z.string(),
  })
  .openapi({ ref: 'SignalMapSourceHealth' });

export const ErrorEnvelope = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .openapi({ ref: 'ErrorEnvelope' });

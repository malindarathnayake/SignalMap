/**
 * SignalMap HTTP endpoint route definitions.
 * Uses zod-openapi's ZodOpenApiPathsObject / requestParams pattern so that
 * query/path parameters are automatically expanded into the OpenAPI parameters array.
 */

import 'zod-openapi/extend';
import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import {
  ErrorEnvelope,
  SignalMapEvent,
  SignalMapSourceHealth,
} from './common.js';

// ---------------------------------------------------------------------------
// Endpoint 1 — GET /api/signalmap/list
// ---------------------------------------------------------------------------

const ListSignalsQuery = z.object({
  start_ms: z.coerce.number().optional(),
  end_ms: z.coerce.number().optional(),
  categories: z.array(z.string()).optional(),
  watch_regions: z.array(z.string()).optional(),
  watch_providers: z.array(z.string()).optional(),
  watchlist_only: z.coerce.boolean().optional(),
});

const ListSignalsResponse = z.object({
  events: z.array(SignalMapEvent),
  sourceHealth: z.array(SignalMapSourceHealth),
  fetchedAt: z.number(),
  upstreamUnavailable: z.boolean(),
});

// ---------------------------------------------------------------------------
// Endpoint 3 — GET /api/signalmap/source-health
// ---------------------------------------------------------------------------

const SourceHealthResponse = z.object({
  sourceHealth: z.array(SignalMapSourceHealth),
  fetchedAt: z.number(),
});

// ---------------------------------------------------------------------------
// Endpoint 5 — GET /api/signalmap/brief/global
// (Cached read of the cron-generated global brief. Cron is the sole writer
// of signalmap:brief:global; the API only reads.)
// ---------------------------------------------------------------------------

const BriefSource = z.object({
  label: z.string(),
  url: z.string(),
});

const GlobalBriefResponse = z.object({
  bullets: z.array(z.string()),
  sources: z.array(BriefSource),
  generatedAt: z.string().nullable(),
  model: z.string().nullable(),
  warnings: z.array(z.string()),
  degraded: z.boolean(),
});

// ---------------------------------------------------------------------------
// Endpoint 6 — POST /api/signalmap/brief/event/{id}
// (On-demand per-event brief. POST because it triggers an LLM call against
// the daily spend reservation; subsequent calls hit the per-event cache.)
// ---------------------------------------------------------------------------

const EventBriefResponse = z.object({
  bullets: z.array(z.string()),
  sources: z.array(BriefSource),
  generatedAt: z.string(),
  model: z.string(),
});

// ---------------------------------------------------------------------------
// Endpoint 7 — GET /api/signalmap/health
// (Live system status consumed by the UI Health panel. Strict shape — the
// UI hard-codes the six component-card keys. Never expose connection URIs,
// filesystem paths, or key prefixes in production responses.)
// ---------------------------------------------------------------------------

const HealthStatus = z.enum(['ok', 'degraded', 'down', 'unknown']);

const ComponentHealth = z.object({
  status: HealthStatus,
  detail: z.string().optional(),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const HealthSourceRow = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['ok', 'degraded', 'stale']),
  latencyMs: z.number(),
  tier: z.number(),
});

const HealthResponse = z.object({
  redis: ComponentHealth,
  lancedb: ComponentHealth,
  collector: ComponentHealth,
  brief: ComponentHealth,
  openrouter: ComponentHealth,
  perplexity: ComponentHealth,
  sources: z.array(HealthSourceRow),
  generatedAt: z.string(),
}).strict();

// ---------------------------------------------------------------------------
// Endpoint 8 — POST /api/signalmap/brief/refresh
// (Admin-only — forces brief-cron to re-run. Auth via SIGNALMAP_ADMIN_TOKEN
// in the X-Signalmap-Admin-Token header.)
// ---------------------------------------------------------------------------

const BriefRefreshResponse = z.object({
  ok: z.boolean(),
  triggeredAt: z.string(),
});

// ---------------------------------------------------------------------------
// Path definitions
// ---------------------------------------------------------------------------

export const signalmapPaths: ZodOpenApiPathsObject = {
  '/api/signalmap/list': {
    get: {
      operationId: 'listSignalMapEvents',
      summary: 'List SignalMap events with filters',
      requestParams: { query: ListSignalsQuery },
      responses: {
        '200': {
          description: 'Filtered SignalMap events with source health',
          content: {
            'application/json': { schema: ListSignalsResponse },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/event/{id}': {
    get: {
      operationId: 'getSignalMapEvent',
      summary: 'Get a single SignalMap event by ID',
      requestParams: {
        path: z.object({ id: z.string() }),
      },
      responses: {
        '200': {
          description: 'SignalMap event',
          content: {
            'application/json': { schema: SignalMapEvent },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/source-health': {
    get: {
      operationId: 'getSignalMapSourceHealth',
      summary: 'Get source health for all SignalMap data providers',
      responses: {
        '200': {
          description: 'Source health summary',
          content: {
            'application/json': { schema: SourceHealthResponse },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/stream': {
    get: {
      operationId: 'streamSignalMapEvents',
      summary: 'SSE stream of live SignalMap events',
      parameters: [
        {
          in: 'header',
          name: 'Last-Event-ID',
          required: false,
          schema: { type: 'string' },
          description: 'Resume SSE stream from a previously received event ID',
        },
      ],
      responses: {
        '200': {
          description: 'SSE event stream (text/event-stream)',
          content: {
            'text/event-stream': { schema: z.string() },
          },
        },
        '204': {
          description:
            'Replay ID was evicted — client must re-fetch from scratch',
          headers: z.object({
            'X-Replay-Lost': z
              .boolean()
              .openapi({ description: 'Set to true when replay ID was evicted' }),
          }),
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/brief/global': {
    get: {
      operationId: 'getSignalMapGlobalBrief',
      summary: 'Read the cron-generated global SignalMap brief (cached)',
      responses: {
        '200': {
          description: 'Global brief with bullet points and sources',
          headers: z.object({
            'X-Cache': z
              .string()
              .openapi({ description: 'Cache status: HIT or MISS' })
              .optional(),
          }),
          content: {
            'application/json': { schema: GlobalBriefResponse },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/brief/event/{id}': {
    post: {
      operationId: 'getSignalMapEventBrief',
      summary: 'Generate or read the per-event "why this matters" brief (cached)',
      requestParams: {
        path: z.object({ id: z.string() }),
      },
      responses: {
        '200': {
          description: 'Event brief with bullets + sources',
          headers: z.object({
            'X-Cache': z
              .string()
              .openapi({ description: 'Cache status: HIT or MISS' })
              .optional(),
          }),
          content: {
            'application/json': { schema: EventBriefResponse },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/brief/refresh': {
    post: {
      operationId: 'refreshSignalMapGlobalBrief',
      summary: 'Force the brief cron to re-run (admin)',
      parameters: [
        {
          in: 'header',
          name: 'X-Signalmap-Admin-Token',
          required: true,
          schema: { type: 'string' },
          description: 'Must match SIGNALMAP_ADMIN_TOKEN env var on the server',
        },
      ],
      responses: {
        '200': {
          description: 'Refresh enqueued',
          content: { 'application/json': { schema: BriefRefreshResponse } },
        },
        '401': {
          description: 'Missing or invalid admin token',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },

  '/api/signalmap/health': {
    get: {
      operationId: 'getSignalMapHealth',
      summary: 'System health snapshot for the UI Health panel',
      responses: {
        '200': {
          description: 'Strict-shape health response with six component cards + sources',
          content: {
            'application/json': { schema: HealthResponse },
          },
        },
        '5XX': {
          description: 'Server error',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },
};

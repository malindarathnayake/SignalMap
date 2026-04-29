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
// Endpoint 5 — POST /api/signalmap/brief/global
// ---------------------------------------------------------------------------

const BriefSource = z.object({
  label: z.string(),
  url: z.string(),
});

const GlobalBriefResponse = z.object({
  bullets: z.array(z.string()),
  generatedAt: z.string(),
  model: z.string(),
  sources: z.array(BriefSource),
  lastGeneratedAt: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Endpoint 6 — POST /api/signalmap/brief/event/{id}
// ---------------------------------------------------------------------------

const EventBriefResponse = z.object({
  whyItMatters: z.string(),
  model: z.string(),
  generatedAt: z.string(),
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
    post: {
      operationId: 'getSignalMapGlobalBrief',
      summary: 'Get AI-generated global SignalMap brief (cached)',
      requestBody: {
        content: {
          'application/json': { schema: z.object({}) },
        },
      },
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
      summary: 'Get AI-generated why-it-matters brief for a specific event (cached)',
      requestParams: {
        path: z.object({ id: z.string() }),
      },
      requestBody: {
        content: {
          'application/json': { schema: z.object({}) },
        },
      },
      responses: {
        '200': {
          description: 'Event brief with why-it-matters explanation',
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
};

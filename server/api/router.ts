import type { IncomingMessage, ServerResponse } from 'node:http';
import { emitMetric, METRICS } from '../../src/server/lib/metrics.js';

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

interface Router {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
  route(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

function parsePath(path: string): { segments: string[] } {
  const segments = path.split('/').filter((s) => s.length > 0);
  return { segments };
}

function matchRoute(route: Route, pathSegments: string[]): Record<string, string> | null {
  if (route.segments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const routeSeg = route.segments[i] ?? '';
    const reqSeg = pathSegments[i] ?? '';

    if (routeSeg.startsWith('{') && routeSeg.endsWith('}')) {
      const name = routeSeg.slice(1, -1);
      params[name] = decodeURIComponent(reqSeg);
    } else if (routeSeg !== reqSeg) {
      return null;
    }
  }
  return params;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(payload);
}

export function createRouter(): Router {
  const routes: Route[] = [];

  function register(method: string, path: string, handler: Handler): void {
    const { segments } = parsePath(path);
    routes.push({ method: method.toUpperCase(), segments, handler });
  }

  return {
    get(path: string, handler: Handler): void {
      register('GET', path, handler);
    },

    post(path: string, handler: Handler): void {
      register('POST', path, handler);
    },

    async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const reqMethod = (req.method ?? 'GET').toUpperCase();

      // Strip query string before matching
      const rawUrl = req.url ?? '/';
      const pathOnly = rawUrl.split('?')[0] ?? '/';
      const reqSegments = pathOnly.split('/').filter((s) => s.length > 0);

      // Metric hook: fires once when the response finishes for any path.
      // Guard with typeof check so unit tests that pass minimal mock res objects
      // (without EventEmitter methods) still work.
      if (typeof (res as unknown as Record<string, unknown>)['once'] === 'function') {
        res.once('finish', () => {
          const method = req.method ?? 'GET';
          const path = pathOnly;
          const status = res.statusCode;
          emitMetric(METRICS.API_REQUEST, 1, { method, path, status });
          if (status >= 400) {
            const code =
              status === 404 ? 'not_found'
              : status === 405 ? 'method_not_allowed'
              : status >= 500 ? 'server_error'
              : 'client_error';
            emitMetric(METRICS.API_ERROR, 1, { code, path });
          }
        });
      }

      // Find all routes whose path structure matches
      const pathMatches: Array<{ route: Route; params: Record<string, string> }> = [];
      for (const route of routes) {
        const params = matchRoute(route, reqSegments);
        if (params !== null) {
          pathMatches.push({ route, params });
        }
      }

      if (pathMatches.length === 0) {
        sendJson(res, 404, { error: { code: 'not_found' } });
        return;
      }

      // Among path matches, find one with matching method
      const methodMatch = pathMatches.find((m) => m.route.method === reqMethod);
      if (!methodMatch) {
        const allowed = pathMatches.map((m) => m.route.method).join(', ');
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Allow', allowed);
        res.end(JSON.stringify({ error: { code: 'method_not_allowed' } }));
        return;
      }

      // Overwrite params — must replace any pre-existing value (security guarantee)
      (req as unknown as Record<string, unknown>)['params'] = { ...methodMatch.params };

      await methodMatch.route.handler(req, res);
    },
  };
}

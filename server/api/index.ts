import { createServer } from 'node:http';
import { createRouter } from './router.ts';
import { emitApiStarted } from './boot.ts';
import { getRedisAdapter } from '../../src/server/lib/redis.js';
import { isLiveMode } from '../../scripts/_signalmap-backend-mode.mjs';
import { createLogger } from '../_shared/logger.ts';
import { handleSignalMapList } from './routes/signalmap-list.ts';
import { handleSignalMapStream } from './routes/signalmap-stream.ts';
import { handleSignalMapBriefGlobal } from './routes/signalmap-brief-global.ts';
import { handleSignalMapBriefEvent } from './routes/signalmap-brief-event.ts';
import { handleSignalMapBriefRefresh } from './routes/signalmap-brief-refresh.ts';
import {
  handleSignalMapBriefRefreshFromUi,
  handleSignalMapBriefRefreshConfig,
} from './routes/signalmap-brief-refresh-from-ui.ts';
import { handleSignalMapBriefHealth } from './routes/signalmap-brief-health.ts';
import { handleSignalMapSourceHealth } from './routes/signalmap-source-health.ts';
import { handleSignalMapSourceHealthDetails } from './routes/signalmap-source-health-details.ts';
import { handleSignalMapHealth } from './routes/signalmap-health.ts';

const log = createLogger('api');

function getPort(): number {
  const raw = process.env.SIGNALMAP_API_PORT;
  return raw ? Number(raw) : 3000;
}

const router = createRouter();
router.get('/api/signalmap/list', handleSignalMapList);
router.get('/api/signalmap/stream', handleSignalMapStream);
router.get('/api/signalmap/brief/global', handleSignalMapBriefGlobal);
router.post('/api/signalmap/brief/event/{id}', handleSignalMapBriefEvent);
router.post('/api/signalmap/brief/refresh', handleSignalMapBriefRefresh);
router.post('/api/signalmap/brief/refresh-from-ui', handleSignalMapBriefRefreshFromUi);
router.get('/api/signalmap/brief/refresh-config', handleSignalMapBriefRefreshConfig);
router.get('/api/signalmap/brief/health', handleSignalMapBriefHealth);
router.get('/api/signalmap/source-health', handleSignalMapSourceHealth);
router.get('/api/signalmap/source-health-details', handleSignalMapSourceHealthDetails);
router.get('/api/signalmap/health', handleSignalMapHealth);

// Attempt to init the redis adapter early so any URL misconfiguration surfaces at boot
// rather than on first request. When REDIS_URL is absent (e.g. fixture mode) we skip
// this and individual route handlers will fall back via their own try/catch.
let adapter: ReturnType<typeof getRedisAdapter> | null = null;
try {
  adapter = getRedisAdapter();
} catch (err) {
  if (isLiveMode()) {
    // Live mode requires Redis. Fail fast at boot rather than letting every route 503.
    log.error('redis:required-in-live-mode', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Allow stdout to flush before exit. The logger writes to stdout, not stderr,
    // so we wait on stdout's drain. (The original code wrote to stderr directly;
    // we accept the stdout switch since structured logs go to stdout per spec line 203.)
    if (process.stdout.writableNeedDrain) {
      process.stdout.once('drain', () => process.exit(1));
    } else {
      process.exit(1);
    }
  }
  // Fixture/dev mode: tolerate missing Redis; routes degrade gracefully.
}

const server = createServer((req, res) => {
  // Top-level catch protects the api process from a single misbehaving
  // route — Node 22's default --unhandled-rejections=throw would otherwise
  // crash the worker on any handler that throws after `await` (e.g. a
  // Redis call inside the singleflight try/finally). Convert any uncaught
  // rejection to a 500 if we can still respond, else just log.
  void router.route(req, res).catch((err) => {
    log.error('router-fatal', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'internal' } }));
    } else {
      try {
        res.end();
      } catch {
        // socket may already be destroyed — nothing more to do
      }
    }
  });
});

const port = getPort();

server.listen(port, () => {
  emitApiStarted({ port, pid: process.pid, node: process.version });
});

// Graceful shutdown — accept SIGTERM, SIGINT, OR a "SHUTDOWN\n" line on stdin.
// Stdin is the cross-platform fallback because Windows child_process.kill('SIGTERM')
// terminates abruptly rather than delivering the signal.
let shuttingDown = false;
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const closePromise = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 5000).unref();
  });

  await Promise.race([closePromise, timeoutPromise]);
  if (adapter !== null) {
    try {
      await adapter.quit();
    } catch {
      // ignore — already closing
    }
  }
  log.info('api:stopped', { reason });
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

// Stdin fallback for Windows tests
let stdinBuffer = '';
process.stdin.on('data', (chunk: Buffer) => {
  stdinBuffer += chunk.toString('utf8');
  if (stdinBuffer.includes('SHUTDOWN')) {
    void shutdown('stdin');
  }
});
process.stdin.on('end', () => {
  /* no-op */
});

/**
 * Phase 5 checkpoint — full compose stack smoke.
 *
 * Brings up redis + signalmap-api + signalmap-collector + signalmap-cron +
 * signalmap-ui via `docker compose up -d --build --force-recreate`, polls
 * for all 5 services to reach `health: healthy`, then verifies nginx +
 * proxy wiring with two HTTP requests:
 *   - GET http://localhost:18080/                 -> 200 (UI shell)
 *   - GET http://localhost:18080/api/signalmap/health -> 200 + v2 strict JSON shape
 *
 * The second assertion is the proof that nginx is proxying to the live
 * signalmap-api (NOT serving the legacy /api/<path>.json static fallback
 * + 503 from the old config — that block was removed in 5c).
 *
 * Cleanup runs even on failure: `docker compose down --remove-orphans`
 * (NO -v — we must NOT touch user volumes).
 *
 * Test is gated on RUN_PHASE_5_CHECKPOINT=1 to keep it out of CI's default
 * `npm run test:data` sweep (it's expensive — ~3-10 min wall clock).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const HOST_PORT = '18080';

interface DockerProc {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runDocker(args: string[], opts: { timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<DockerProc> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('docker', args, {
      cwd: REPO_ROOT,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString('utf8')));
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* noop */ }
      rejectP(new Error(`docker ${args.slice(0, 3).join(' ')}... timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

interface ComposePsRow {
  Name: string;
  Service: string;
  State: string;
  Health: string;  // "healthy" | "starting" | "unhealthy" | "" (no healthcheck)
}

async function waitForAllHealthy(env: NodeJS.ProcessEnv, budgetMs: number): Promise<ComposePsRow[]> {
  const expectedServices = new Set([
    'signalmap-redis',
    'signalmap-api',
    'signalmap-collector',
    'signalmap-cron',
    'signalmap-ui',
  ]);

  const startedAt = Date.now();
  let lastSnapshot: ComposePsRow[] = [];
  while (Date.now() - startedAt < budgetMs) {
    const ps = await runDocker(
      ['compose', 'ps', '--format', 'json'],
      { timeoutMs: 15_000, env },
    );
    if (ps.code !== 0) {
      throw new Error(`docker compose ps failed: ${ps.stderr}`);
    }
    // `docker compose ps --format json` emits one JSON object per LINE
    // (not a JSON array). Split + parse each.
    const rows: ComposePsRow[] = ps.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as ComposePsRow);

    lastSnapshot = rows;

    const byService = new Map(rows.map((r) => [r.Service, r]));
    const allHealthy = Array.from(expectedServices).every((svc) => {
      const r = byService.get(svc);
      return r && r.Health === 'healthy';
    });

    if (allHealthy) return rows;

    // Wait 3s before re-polling
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(
    `not all 5 services reached healthy within ${budgetMs}ms.\nLast snapshot:\n` +
      lastSnapshot.map((r) => `  ${r.Service}: state=${r.State} health=${r.Health}`).join('\n'),
  );
}

async function curlOk(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('curl', ['-fsS', '-o', '-', '-w', '\\nHTTP_STATUS=%{http_code}', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const out: string[] = [];
    const err: string[] = [];
    proc.stdout.on('data', (d: Buffer) => out.push(d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => err.push(d.toString('utf8')));
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* noop */ }
      rejectP(new Error(`curl ${url} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on('error', (e) => { clearTimeout(timer); rejectP(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const stdout = out.join('');
      const stderr = err.join('');
      const m = stdout.match(/HTTP_STATUS=(\d+)$/);
      if (!m) {
        rejectP(new Error(`curl ${url} did not emit HTTP_STATUS marker. exit=${String(code)} stderr=${stderr}`));
        return;
      }
      const status = Number.parseInt(m[1]!, 10);
      const body = stdout.replace(/\nHTTP_STATUS=\d+$/, '');
      resolveP({ status, body });
    });
  });
}

const skipReason = process.env.RUN_PHASE_5_CHECKPOINT === '1'
  ? null
  : 'set RUN_PHASE_5_CHECKPOINT=1 to run the heavy compose smoke (~3-10 min wall clock)';

test(
  'phase 5 checkpoint: docker compose up + 5/5 healthy + UI shell + /api/signalmap/health proxied',
  { timeout: 900_000, skip: skipReason ?? undefined },
  async () => {
    const env = {
      ...process.env,
      REDIS_PASSWORD: 'phase5-checkpoint-password',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      OPENROUTER_API_KEY: 'test-key-for-checkpoint',
      PERPLEXITY_API_KEY: 'test-key-for-checkpoint',
      SIGNALMAP_PORT: HOST_PORT,
      SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
    };

    let teardownNeeded = false;
    try {
      // 1. Bring up the stack. --build forces image rebuild (5a + ui). --force-recreate
      //    kills any existing containers from prior runs. -d returns immediately,
      //    healthchecks are async.
      const up = await runDocker(
        ['compose', 'up', '-d', '--build', '--force-recreate'],
        { timeoutMs: 600_000, env },
      );
      teardownNeeded = true;
      assert.equal(up.code, 0, `docker compose up exit ${String(up.code)}\nSTDERR:\n${up.stderr}\nSTDOUT:\n${up.stdout}`);

      // 2. Wait for all 5 services to report health: healthy.
      //    Worst-case timing: redis ~10s + api ~20s + ui ~20s + collector/cron
      //    healthchecks at 30s interval after 30s start_period. Budget 240s.
      const snapshot = await waitForAllHealthy(env, 240_000);
      const services = new Set(snapshot.map((r) => r.Service));
      for (const svc of ['signalmap-redis', 'signalmap-api', 'signalmap-collector', 'signalmap-cron', 'signalmap-ui']) {
        assert.ok(services.has(svc), `${svc} must be in compose ps output; got: ${Array.from(services).join(', ')}`);
      }

      // 3. UI shell on host port 18080.
      const uiResp = await curlOk(`http://localhost:${HOST_PORT}/`, 10_000);
      assert.equal(uiResp.status, 200, `UI shell GET / returned ${uiResp.status}; body head: ${uiResp.body.slice(0, 200)}`);
      // The SPA HTML should reference the bundle script
      assert.ok(
        uiResp.body.toLowerCase().includes('<!doctype html') || uiResp.body.toLowerCase().includes('<html'),
        `UI shell must serve HTML; got body head: ${uiResp.body.slice(0, 200)}`,
      );

      // 4. /api/signalmap/health proxied through nginx -> signalmap-api.
      //    This is the legacy-fallback regression guard: the old config returned 503
      //    + body `{"error":{"code":"backend_unavailable"...}}` for any /api/* request
      //    when the backend wasn't bundled. After 5c, /api/* must hit the live api.
      const healthResp = await curlOk(`http://localhost:${HOST_PORT}/api/signalmap/health`, 15_000);
      assert.equal(healthResp.status, 200, `/api/signalmap/health returned ${healthResp.status}; body: ${healthResp.body}`);

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(healthResp.body) as Record<string, unknown>;
      } catch (e) {
        throw new Error(`/api/signalmap/health body did not parse as JSON: ${healthResp.body.slice(0, 500)}`);
      }

      // Strict-shape keys per server/api/schemas/signalmap.ts HealthResponse
      const requiredKeys = ['redis', 'lancedb', 'collector', 'brief', 'openrouter', 'perplexity', 'sources', 'generatedAt'];
      for (const k of requiredKeys) {
        assert.ok(k in parsed, `health response must contain "${k}"; got keys: ${Object.keys(parsed).join(', ')}`);
      }

      // Regression guard: the legacy 503 body had `error.code === 'backend_unavailable'`.
      // The new live response must NOT have that shape.
      assert.ok(
        !('error' in parsed) || (parsed as { error?: { code?: string } }).error?.code !== 'backend_unavailable',
        `health response must NOT be the legacy backend_unavailable 503 fallback; got: ${healthResp.body.slice(0, 200)}`,
      );
    } finally {
      // 5. Teardown — remove containers + network, but NEVER -v (volumes belong
      //    to the user / persist across runs). --remove-orphans cleans up any
      //    stale containers from prior compose definitions.
      if (teardownNeeded) {
        await runDocker(
          ['compose', 'down', '--remove-orphans'],
          { timeoutMs: 60_000, env },
        ).catch(() => undefined);
      }
    }
  },
);

/**
 * Phase 5 unit 5b — docker-compose.yml shape test.
 *
 * Asserts: compose v2 (no `version:`); name=signalmap; 5 services with the
 * expected build/image/command/healthcheck wiring; redis has --requirepass;
 * redis port not host-exposed; secrets block declared; PERPLEXITY_API_KEY
 * + SIGNALMAP_BACKEND_MODE pass through; no LOCAL_API_* envs.
 *
 * Runs `docker compose config --format json` so we read what compose
 * actually resolves, not what the YAML literally says.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

interface ComposeConfig {
  name: string;
  version?: string;
  services: Record<string, ComposeService>;
  secrets?: Record<string, { file?: string; external?: boolean }>;
  volumes?: Record<string, unknown>;
}

interface ComposeService {
  image?: string;
  container_name?: string;
  command?: string[] | string;
  build?: { context?: string; dockerfile?: string };
  environment?: Record<string, string>;
  ports?: Array<{ published?: string; target?: number; mode?: string }> | string[];
  secrets?: Array<string | { source: string }>;
  depends_on?: Record<string, { condition?: string }> | string[];
  healthcheck?: { test?: string[] | string; interval?: string; start_period?: string };
  volumes?: unknown[];
  deploy?: { replicas?: number };
  restart?: string;
}

function runComposeConfig(env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      'docker',
      ['compose', '-f', 'docker-compose.yml', 'config', '--format', 'json'],
      {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString('utf8')));
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* noop */ }
      rejectP(new Error('docker compose config timed out after 30s'));
    }, 30_000);
    proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

test('docker compose config exits 0 with required env set', { timeout: 60_000 }, async () => {
  const { code, stdout, stderr } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_PORT: '8080',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0, `docker compose config exit ${String(code)}\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`);
  assert.ok(stdout.length > 0, 'config produced no stdout');
  // Validate JSON parses
  const parsed = JSON.parse(stdout) as ComposeConfig;
  assert.equal(parsed.name, 'signalmap', 'top-level name must be "signalmap"');
  assert.ok(parsed.version === undefined, 'compose v2 must NOT have a `version:` field');
});

test('compose has the 5 expected services with correct images', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;
  const expected = ['signalmap-redis', 'signalmap-api', 'signalmap-collector', 'signalmap-cron', 'signalmap-ui'];
  for (const name of expected) {
    assert.ok(parsed.services[name], `service ${name} must exist; have: ${Object.keys(parsed.services).join(', ')}`);
  }
  assert.equal(Object.keys(parsed.services).length, 5, 'exactly 5 services expected');

  assert.ok(parsed.services['signalmap-redis']!.image?.includes('redis:7-alpine'), 'redis image must be redis:7-alpine');
  assert.equal(parsed.services['signalmap-api']!.image, 'signalmap-node:latest', 'api image is signalmap-node:latest');
  assert.equal(parsed.services['signalmap-collector']!.image, 'signalmap-node:latest');
  assert.equal(parsed.services['signalmap-cron']!.image, 'signalmap-node:latest');
  assert.equal(parsed.services['signalmap-ui']!.image, 'signalmap-ui:latest', 'ui image is signalmap-ui:latest (renamed from signalmap:latest)');
});

test('redis has --requirepass and is NOT exposed to host', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;
  const redis = parsed.services['signalmap-redis']!;

  const cmd = Array.isArray(redis.command) ? redis.command : [redis.command ?? ''];
  const flatCmd = cmd.join(' ');
  assert.ok(flatCmd.includes('--requirepass'), `redis command must include --requirepass; got: ${flatCmd}`);
  assert.ok(flatCmd.includes('test-password'), 'requirepass must expand REDIS_PASSWORD');

  assert.ok(!redis.ports || redis.ports.length === 0, 'redis must not expose ports to host');
});

test('worker services declare command roles api/collector/cron', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  const roles: Record<string, string> = {
    'signalmap-api': 'api',
    'signalmap-collector': 'collector',
    'signalmap-cron': 'cron',
  };
  for (const [svc, expectedRole] of Object.entries(roles)) {
    const cmd = parsed.services[svc]!.command;
    const cmdArr = Array.isArray(cmd) ? cmd : [cmd];
    assert.deepEqual(cmdArr, [expectedRole], `${svc} command must be [${expectedRole}]; got: ${JSON.stringify(cmd)}`);
  }
});

test('SIGNALMAP_ADMIN_TOKEN is wired via secrets, not env', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  assert.ok(parsed.secrets, 'top-level secrets block must exist');
  assert.ok(parsed.secrets['SIGNALMAP_ADMIN_TOKEN'], 'SIGNALMAP_ADMIN_TOKEN secret must be declared');

  // api + cron consume the secret; collector does not need admin-token
  for (const svc of ['signalmap-api', 'signalmap-cron']) {
    const secrets = parsed.services[svc]!.secrets ?? [];
    const names = secrets.map((s) => (typeof s === 'string' ? s : s.source));
    assert.ok(
      names.includes('SIGNALMAP_ADMIN_TOKEN'),
      `${svc} must consume SIGNALMAP_ADMIN_TOKEN secret`,
    );
    const env = parsed.services[svc]!.environment ?? {};
    assert.ok(
      !('SIGNALMAP_ADMIN_TOKEN' in env),
      `${svc} must NOT have SIGNALMAP_ADMIN_TOKEN as plain env (it must enter via /run/secrets)`,
    );
  }
});

test('PERPLEXITY_API_KEY + SIGNALMAP_BACKEND_MODE pass through; LOCAL_API_* removed', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    OPENROUTER_API_KEY: 'sk-or-test',
    SIGNALMAP_LLM_MODELS: 'test/model',
    PERPLEXITY_API_KEY: 'pplx-test',
    NEWSAPI_API_KEY: 'newsapi-test',
    SIGNALMAP_BACKEND_MODE: 'live',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  // PERPLEXITY_API_KEY required on api + cron (LLM consumers)
  for (const svc of ['signalmap-api', 'signalmap-cron']) {
    const env = parsed.services[svc]!.environment ?? {};
    assert.equal(env['PERPLEXITY_API_KEY'], 'pplx-test', `${svc} must pass PERPLEXITY_API_KEY through`);
    assert.equal(env['SIGNALMAP_BACKEND_MODE'], 'live', `${svc} must pass SIGNALMAP_BACKEND_MODE through`);
  }

  assert.equal(
    parsed.services['signalmap-collector']!.environment?.['NEWSAPI_API_KEY'],
    'newsapi-test',
    'collector must pass NEWSAPI_API_KEY through',
  );
  assert.equal(
    parsed.services['signalmap-collector']!.environment?.['OPENROUTER_API_KEY'],
    'sk-or-test',
    'collector must pass OPENROUTER_API_KEY through for article category mapping',
  );
  assert.equal(
    parsed.services['signalmap-collector']!.environment?.['SIGNALMAP_LLM_MODELS'],
    'test/model',
    'collector must pass SIGNALMAP_LLM_MODELS through for article category mapping',
  );
  assert.equal(
    parsed.services['signalmap-collector']!.environment?.['SIGNALMAP_DISTILL_ROOT'],
    '/app/vendor/distill',
    'collector must point Distill extraction at the bundled runtime path',
  );
  assert.equal(
    parsed.services['signalmap-collector']!.environment?.['SIGNALMAP_NEWS_ITEMS_PER_SOURCE'],
    '5',
    'collector must bound per-source news work on cold start',
  );

  // LOCAL_API_* must not appear anywhere
  for (const svc of Object.keys(parsed.services)) {
    const env = parsed.services[svc]!.environment ?? {};
    for (const k of Object.keys(env)) {
      assert.ok(!k.startsWith('LOCAL_API_'), `${svc} must not have LOCAL_API_* env (got ${k})`);
    }
  }
});

test('worker services declare replicas: 1', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  for (const svc of ['signalmap-collector', 'signalmap-cron']) {
    const replicas = parsed.services[svc]!.deploy?.replicas;
    assert.equal(replicas, 1, `${svc} must declare replicas: 1 (singleton lease enforcement)`);
  }
});

test('all services declare a healthcheck', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  for (const svc of Object.keys(parsed.services)) {
    const hc = parsed.services[svc]!.healthcheck;
    assert.ok(hc?.test, `${svc} must have a healthcheck.test`);
  }
});

test('only signalmap-ui exposes ports to host', { timeout: 60_000 }, async () => {
  const { code, stdout } = await runComposeConfig({
    ...process.env,
    REDIS_PASSWORD: 'test-password',
    SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as ComposeConfig;

  for (const svc of ['signalmap-redis', 'signalmap-api', 'signalmap-collector', 'signalmap-cron']) {
    const ports = parsed.services[svc]!.ports;
    assert.ok(!ports || ports.length === 0, `${svc} must not expose host ports`);
  }
  const uiPorts = parsed.services['signalmap-ui']!.ports;
  assert.ok(uiPorts && uiPorts.length === 1, 'signalmap-ui must expose exactly one port');
});

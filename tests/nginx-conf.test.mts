/**
 * Phase 5 unit 5c — nginx.conf shape + syntax test.
 *
 * Test 1: nginx -t (syntax check) passes inside an nginx:1.27-alpine
 *         container with the conf bind-mounted read-only.
 * Test 2: static-fallback rules are removed (no @api_unavailable, no
 *         try_files /api/$api_path.json).
 * Test 3: SSE block has proxy_buffering off; the catch-all /api/ block
 *         does NOT (it would break non-SSE responses).
 * Test 4: proxy_pass http://signalmap-api:3000 is wired.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const NGINX_CONF = resolve(REPO_ROOT, 'docker', 'nginx.conf');

function runDocker(args: string[], opts: { timeoutMs: number }): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('docker', args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString('utf8')));
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* noop */ }
      rejectP(new Error(`docker ${args.join(' ')} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

test('nginx -t passes against docker/nginx.conf', { timeout: 60_000 }, async () => {
  // Bind-mount the conf as read-only into nginx:1.27-alpine and run `nginx -t`.
  // Use forward slashes for the host path since docker on Windows accepts them
  // and the alpine container expects POSIX paths anyway.
  const hostPath = NGINX_CONF.replace(/\\/g, '/');
  const { code, stdout, stderr } = await runDocker(
    [
      'run', '--rm',
      '-v', `${hostPath}:/etc/nginx/nginx.conf:ro`,
      // nginx resolves upstream hostnames at config-load time. Add a fake
      // host entry so `nginx -t` doesn't fail with "host not found in upstream".
      // The IP doesn't matter — only the DNS resolution matters for -t.
      '--add-host', 'signalmap-api:127.0.0.1',
      'nginx:1.27-alpine',
      'nginx', '-t',
    ],
    { timeoutMs: 50_000 },
  );
  // nginx -t writes its result to stderr even on success; merge for diagnostics.
  const combined = stdout + stderr;
  assert.equal(
    code, 0,
    `nginx -t exited ${String(code)}\nOUTPUT:\n${combined}`,
  );
  assert.ok(
    combined.includes('syntax is ok') && combined.includes('test is successful'),
    `nginx -t output unexpected:\n${combined}`,
  );
});

test('static-fallback rules are removed', () => {
  const conf = readFileSync(NGINX_CONF, 'utf8');
  assert.ok(
    !conf.includes('@api_unavailable'),
    '@api_unavailable location must be removed (was lines 76-80)',
  );
  assert.ok(
    !conf.includes('try_files /api/'),
    'try_files /api/$api_path.json must be removed (was line 73)',
  );
  assert.ok(
    !conf.includes('backend_unavailable'),
    'backend_unavailable JSON body must be removed',
  );
});

test('proxy_buffering off lives ONLY in the SSE-specific block', () => {
  const conf = readFileSync(NGINX_CONF, 'utf8');

  // Locate the SSE block boundaries.
  const sseStart = conf.indexOf('location = /api/signalmap/stream');
  assert.ok(sseStart !== -1, 'SSE-specific location must exist');
  // Find the matching closing brace by simple bracket counting.
  let depth = 0;
  let sseEnd = -1;
  for (let i = sseStart; i < conf.length; i++) {
    if (conf[i] === '{') depth++;
    else if (conf[i] === '}') {
      depth--;
      if (depth === 0) { sseEnd = i; break; }
    }
  }
  assert.ok(sseEnd !== -1, 'SSE block must close');

  const sseBlock = conf.slice(sseStart, sseEnd + 1);
  assert.ok(sseBlock.includes('proxy_buffering off'), 'SSE block must set proxy_buffering off');
  assert.ok(sseBlock.includes('proxy_cache off'), 'SSE block must set proxy_cache off');
  assert.ok(sseBlock.includes('X-Accel-Buffering no'), 'SSE block must set X-Accel-Buffering no');
  assert.ok(sseBlock.includes('proxy_read_timeout 1d'), 'SSE block must set proxy_read_timeout 1d');

  // Locate the catch-all /api/ block (NOT the SSE = /api/signalmap/stream).
  // It starts after the SSE block.
  const apiCatchStart = conf.indexOf('location /api/ ', sseEnd);
  assert.ok(apiCatchStart !== -1, 'catch-all location /api/ must exist');
  let depth2 = 0;
  let apiCatchEnd = -1;
  for (let i = apiCatchStart; i < conf.length; i++) {
    if (conf[i] === '{') depth2++;
    else if (conf[i] === '}') {
      depth2--;
      if (depth2 === 0) { apiCatchEnd = i; break; }
    }
  }
  const apiCatchBlock = conf.slice(apiCatchStart, apiCatchEnd + 1);
  assert.ok(
    !apiCatchBlock.includes('proxy_buffering off'),
    'catch-all /api/ block must NOT set proxy_buffering off (only SSE needs that)',
  );
});

test('proxy_pass to signalmap-api:3000 is wired in both /api/ blocks', () => {
  const conf = readFileSync(NGINX_CONF, 'utf8');
  const matches = conf.match(/proxy_pass\s+http:\/\/signalmap-api:3000/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected proxy_pass to signalmap-api:3000 in both SSE + catch-all /api/ blocks; found ${matches.length}`,
  );
});

test('static asset locations remain (regression guard)', () => {
  const conf = readFileSync(NGINX_CONF, 'utf8');
  for (const loc of ['/assets/', '/topojson/', '/favico/', '/.well-known/', '/robots.txt', '/sitemap.xml', '/openapi.yaml']) {
    assert.ok(conf.includes(loc), `static asset location ${loc} must remain in nginx.conf`);
  }
  assert.ok(conf.includes('try_files $uri $uri/ /index.html'), 'SPA fallback must remain');
});

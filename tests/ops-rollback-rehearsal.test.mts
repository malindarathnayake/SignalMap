/**
 * ops-rollback-rehearsal.test.mts — Phase 9c rollback toolkit rehearsal.
 *
 * OPERATOR PREREQUISITES (subtests 3–5, gated on RUN_PHASE_9C_REHEARSAL=1):
 *   - Docker daemon running (does NOT require the full compose stack for dry-run tests)
 *   - Run from repo root: RUN_PHASE_9C_REHEARSAL=1 npx tsx --test tests/ops-rollback-rehearsal.test.mts
 *
 * FULL LIVE REHEARSAL (subtest 6, gated on BOTH env vars):
 *   - Requires a running compose stack with known-good and known-bad image tags.
 *   - Set RUN_PHASE_9C_REHEARSAL=1 AND RUN_PHASE_9C_LIVE=1.
 *   - See the README Rollback (Phase 9c) section for the full operator procedure.
 *   - Target: complete recovery in < 5 min wall-clock time.
 *
 * Subtest gating:
 *   - Subtests 1–2: always run (no gate). Validate scripts exist and print usage.
 *   - Subtests 3–5: gated on RUN_PHASE_9C_REHEARSAL=1 (dry-run calls, no stack needed).
 *   - Subtest 6: documentation-only placeholder; skip in all automated runs.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env['RUN_PHASE_9C_REHEARSAL'] === '1';

interface RunResult { code: number | null; stdout: string; stderr: string; }

function runNode(args: string[], opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((res, rej) => {
    const proc = spawn('node', args, {
      cwd: REPO_ROOT,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    proc.stdout.on('data', (d) => stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d) => stderr.push(d.toString('utf8')));
    const t = setTimeout(() => { try { proc.kill(); } catch { /* ignore */ } rej(new Error('timeout')); }, opts.timeoutMs ?? 15_000);
    proc.on('close', (code) => { clearTimeout(t); res({ code, stdout: stdout.join(''), stderr: stderr.join('') }); });
    proc.on('error', rej);
  });
}

const SCRIPTS = [
  'scripts/ops/rollback-image.mjs',
  'scripts/ops/redis-snapshot.mjs',
  'scripts/ops/lancedb-snapshot.mjs',
] as const;

// ---------------------------------------------------------------------------
// Subtest 1: Scripts exist and are non-empty (always runs)
// ---------------------------------------------------------------------------

test('scripts/ops/*.mjs files exist and are non-empty', () => {
  for (const scriptPath of SCRIPTS) {
    const absPath = resolve(REPO_ROOT, scriptPath);
    assert.ok(existsSync(absPath), `Missing script: ${scriptPath}`);
    const stat = statSync(absPath);
    assert.ok(stat.size > 0, `Script is empty: ${scriptPath}`);
  }
});

// ---------------------------------------------------------------------------
// Subtest 2: Each script prints usage when run without args (always runs)
// ---------------------------------------------------------------------------

test('each ops script prints usage when run without args', async () => {
  for (const scriptPath of SCRIPTS) {
    const result = await runNode([scriptPath]);
    // Scripts exit non-zero and print usage to stderr when given no args
    assert.notEqual(result.code, 0, `${scriptPath} should exit non-zero when called without args (got ${result.code})`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('usage'),
      `${scriptPath} should print "usage" when called without args.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Subtests 3–5: Gated on RUN_PHASE_9C_REHEARSAL=1 (dry-run, no stack needed)
// ---------------------------------------------------------------------------

test('dry-run rollback-image (gated)', { skip: !GATE ? 'set RUN_PHASE_9C_REHEARSAL=1 to run' : false }, async () => {
  const result = await runNode(
    ['scripts/ops/rollback-image.mjs', '--service', 'signalmap-api', '--tag', 'v0.0.0-nonexistent', '--dry-run'],
    { timeoutMs: 15_000 },
  );
  assert.equal(result.code, 0, `Expected exit 0 from dry-run.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(
    result.stdout.includes('[plan]'),
    `Expected "[plan]" in stdout.\nstdout: ${result.stdout}`,
  );
  assert.ok(
    result.stdout.includes('[dry-run]'),
    `Expected "[dry-run]" in stdout.\nstdout: ${result.stdout}`,
  );
});

test('dry-run redis-snapshot save (gated)', { skip: !GATE ? 'set RUN_PHASE_9C_REHEARSAL=1 to run' : false }, async () => {
  const result = await runNode(
    ['scripts/ops/redis-snapshot.mjs', 'save', '--dry-run'],
    {
      timeoutMs: 15_000,
      env: { ...process.env, REDIS_PASSWORD: 'placeholder' },
    },
  );
  assert.equal(result.code, 0, `Expected exit 0 from dry-run.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(
    (result.stdout + result.stderr).includes('[dry-run]'),
    `Expected "[dry-run]" in output.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test('dry-run lancedb-snapshot save (gated)', { skip: !GATE ? 'set RUN_PHASE_9C_REHEARSAL=1 to run' : false }, async () => {
  const result = await runNode(
    ['scripts/ops/lancedb-snapshot.mjs', 'save', '--dry-run'],
    { timeoutMs: 15_000 },
  );
  assert.equal(result.code, 0, `Expected exit 0 from dry-run.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(
    (result.stdout + result.stderr).includes('[dry-run]'),
    `Expected "[dry-run]" in output.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

// ---------------------------------------------------------------------------
// Subtest 6: Full live drill — documentation-only placeholder
// ---------------------------------------------------------------------------

test('full live rollback drill (operator-driven — see README Phase 9c section)', (t) => {
  t.skip(
    'The full live rehearsal (running stack, known-bad deploy, recovery in < 5 min) is operator-driven. ' +
    'Procedure: ' +
    '(1) Bring up the compose stack with a "bad" image tag. ' +
    '(2) Run: node scripts/ops/rollback-image.mjs --service signalmap-api --tag <last-good-tag>. ' +
    '(3) Run: REDIS_PASSWORD=... node scripts/ops/redis-snapshot.mjs verify to confirm state. ' +
    '(4) Optionally restore a pre-deploy Redis snapshot or LanceDB snapshot if data was corrupted. ' +
    'See README.md ## Rollback (Phase 9c) for the full procedure. ' +
    'To enable dry-run subtests only: set RUN_PHASE_9C_REHEARSAL=1. ' +
    'This subtest is intentionally skipped in all automated CI runs.',
  );
});

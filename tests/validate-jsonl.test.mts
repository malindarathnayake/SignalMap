/**
 * Phase 7 unit 7c — validate-jsonl.mjs unit tests.
 *
 * Tests the cross-platform JSONL log validator. Uses spawnSync to invoke
 * the script as a subprocess, with tmp-file fixtures created per test.
 *
 * Gate (spec line 396): Valid JSON lines with `ts`, `level`, `service`, `event`.
 */

import { test, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'validate-jsonl.mjs');

/** Temp files to clean up after the suite. */
const tmpFiles: string[] = [];

function makeTmpFile(content: string): string {
  const p = join(tmpdir(), `validate-jsonl-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(p, content, 'utf8');
  tmpFiles.push(p);
  return p;
}

after(() => {
  for (const p of tmpFiles) {
    if (existsSync(p)) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }
  }
});

function runValidator(fixturePath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    'node',
    [SCRIPT, fixturePath],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ─── Test cases ───────────────────────────────────────────────────────────────

test('valid-jsonl-exits-0', () => {
  const content = [
    '{"ts":"2026-04-30T12:00:00.000Z","level":"info","service":"api","event":"api:started","port":3000}',
    '{"ts":"2026-04-30T12:00:01.000Z","level":"info","service":"api","event":"request","method":"GET"}',
    '{"ts":"2026-04-30T12:00:02.000Z","level":"error","service":"collector","event":"collector-tick-fail","error":{"message":"boom"}}',
  ].join('\n');

  const fixture = makeTmpFile(content);
  const { status, stdout } = runValidator(fixture);

  assert.equal(status, 0, `expected exit 0, got ${String(status)}`);
  assert.ok(
    stdout.includes('validated 3 JSON line(s)'),
    `expected "validated 3 JSON line(s)" in stdout, got: ${stdout}`,
  );
});

test('missing-required-field-exits-1', () => {
  const content = [
    '{"ts":"2026-04-30T12:00:00.000Z","level":"info","service":"api","event":"ok"}',
    '{"ts":"2026-04-30T12:00:01.000Z","level":"info","event":"missing-service"}',
  ].join('\n');

  const fixture = makeTmpFile(content);
  const { status, stderr } = runValidator(fixture);

  assert.equal(status, 1, `expected exit 1, got ${String(status)}`);
  assert.ok(
    stderr.includes('line 2'),
    `expected "line 2" in stderr, got: ${stderr}`,
  );
  assert.ok(
    stderr.includes('service'),
    `expected "service" in stderr, got: ${stderr}`,
  );
  assert.ok(
    stderr.includes('1/2 invalid'),
    `expected "1/2 invalid" in stderr, got: ${stderr}`,
  );
});

test('invalid-json-exits-1', () => {
  const content = [
    '{"ts":"2026-04-30T12:00:00.000Z","level":"info","service":"api","event":"ok"}',
    'not even json',
  ].join('\n');

  const fixture = makeTmpFile(content);
  const { status, stdout, stderr } = runValidator(fixture);

  assert.equal(status, 1, `expected exit 1, got ${String(status)}`);
  assert.ok(
    stderr.includes('line 2'),
    `expected "line 2" in stderr, got: ${stderr}`,
  );
  // Must mention JSON parse failure — check stderr and stdout combined.
  const combined = stdout + stderr;
  assert.ok(
    combined.toLowerCase().includes('json') || combined.includes('parse'),
    `expected JSON parse failure mention, got: ${combined}`,
  );
});

test('empty-file-exits-0', () => {
  // Zero bytes — empty file.
  const fixture = makeTmpFile('');
  const { status, stdout } = runValidator(fixture);

  assert.equal(status, 0, `expected exit 0, got ${String(status)}`);
  assert.ok(
    stdout.includes('validated 0 JSON line(s)'),
    `expected "validated 0 JSON line(s)" in stdout, got: ${stdout}`,
  );
});

test('bad-ts-string-exits-1', () => {
  const content = '{"ts":"not-a-date","level":"info","service":"api","event":"ok"}';

  const fixture = makeTmpFile(content);
  const { status, stderr } = runValidator(fixture);

  assert.equal(status, 1, `expected exit 1, got ${String(status)}`);
  assert.ok(
    stderr.includes('line 1'),
    `expected "line 1" in stderr, got: ${stderr}`,
  );
  assert.ok(
    stderr.includes('ts'),
    `expected "ts" mention in stderr, got: ${stderr}`,
  );
});

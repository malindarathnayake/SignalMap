/**
 * Phase 9 checkpoint — production-hardening acceptance.
 *
 * Aggregates the four Phase 9 sub-tests:
 *   - 9a: tests/admin-token-not-in-browser.test.mts (gated; skip-path always exits 0)
 *   - 9a server: tests/api-brief-refresh-from-ui-route.test.mts (always-on, 11 subtests)
 *   - 9b: tests/compose-negative-path.test.mts (always-on; uses docker if available, skips otherwise)
 *   - 9c: tests/ops-rollback-rehearsal.test.mts (gated; skip-path always exits 0)
 *   - 9d: tests/openapi-handler-parity.test.mts (always-on, 4 subtests)
 *
 * Each sub-test is invoked as a separate `node --import tsx --test` process so
 * a hang or assertion failure in one cannot pollute the others. A subtest fails
 * iff its child process exits non-zero.
 *
 * This test is always-on: it runs in skip-path for sub-tests that need a live
 * stack. The skip-path is the contract — gating the operator-driven paths
 * (RUN_PHASE_9A_BROWSER_CHECK=1, RUN_PHASE_9C_REHEARSAL=1) is the operator's
 * job; this checkpoint just verifies the un-gated default exits 0.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runTsxTest(testFile: string, timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((res, rej) => {
    const proc = spawn('npx', ['tsx', '--test', testFile], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString('utf8')));
    const t = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* noop */
      }
      rej(new Error(`timeout after ${timeoutMs}ms running ${testFile}`));
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(t);
      res({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
    proc.on('error', rej);
  });
}

const SUB_TESTS: Array<{ unit: string; file: string }> = [
  { unit: '9a-server', file: 'tests/api-brief-refresh-from-ui-route.test.mts' },
  { unit: '9a-browser', file: 'tests/admin-token-not-in-browser.test.mts' },
  { unit: '9b', file: 'tests/compose-negative-path.test.mts' },
  { unit: '9c', file: 'tests/ops-rollback-rehearsal.test.mts' },
  { unit: '9d', file: 'tests/openapi-handler-parity.test.mts' },
];

for (const { unit, file } of SUB_TESTS) {
  test(`Phase 9 sub-test ${unit} (${file}) exits 0`, { timeout: 180_000 }, async () => {
    const result = await runTsxTest(file);
    assert.equal(
      result.code,
      0,
      `sub-test ${unit} (${file}) failed with exit ${String(result.code)}\n` +
        `STDOUT (last 1500 chars):\n${result.stdout.slice(-1500)}\n` +
        `STDERR (last 1500 chars):\n${result.stderr.slice(-1500)}`,
    );
  });
}

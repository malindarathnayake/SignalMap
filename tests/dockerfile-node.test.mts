/**
 * Phase 5 unit 5a — Dockerfile.node smoke test.
 *
 * Test 1: `docker build -f docker/Dockerfile.node .` exits 0.
 * Test 2: `docker run signalmap-node:phase5a-test api` boots far enough to
 *         emit the structured `api:started` log line on stdout. We do NOT
 *         require a working Redis — the api wraps `getRedisAdapter()` in a
 *         try/catch and still emits the boot line; Redis-dependent routes
 *         fail at request time, which is fine for image-level smoke.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const IMAGE_TAG = 'signalmap-node:phase5a-test';

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
      rejectP(new Error(`docker ${args.join(' ')} timed out after ${opts.timeoutMs}ms\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`));
    }, opts.timeoutMs);
    proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

test(
  'docker build -f docker/Dockerfile.node . exits 0',
  { timeout: 600_000 },
  async () => {
    const { code, stderr } = await runDocker(
      ['build', '-t', IMAGE_TAG, '-f', 'docker/Dockerfile.node', '.'],
      { timeoutMs: 580_000 },
    );
    assert.equal(code, 0, `docker build exited ${String(code)}\n${stderr}`);
  },
);

test(
  'docker run signalmap-node:phase5a-test api emits api:started log line',
  { timeout: 60_000 },
  async () => {
    // Use a unique container name so cleanup is reliable.
    const containerName = `signalmap-node-5a-${Date.now()}`;

    const proc = spawn(
      'docker',
      ['run', '--rm', '--name', containerName, IMAGE_TAG, 'api'],
      {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );

    const stdoutBuf: string[] = [];
    const stderrBuf: string[] = [];
    let started = false;

    try {
      await new Promise<void>((resolveP, rejectP) => {
        const timer = setTimeout(() => {
          rejectP(new Error(
            `api:started not seen within 30s.\nSTDOUT:\n${stdoutBuf.join('')}\nSTDERR:\n${stderrBuf.join('')}`,
          ));
        }, 30_000);

        let buf = '';
        proc.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf8');
          stdoutBuf.push(d.toString('utf8'));
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim() === '') continue;
            try {
              const obj = JSON.parse(line) as Record<string, unknown>;
              if (obj['event'] === 'api:started') {
                started = true;
                clearTimeout(timer);
                resolveP();
                return;
              }
            } catch {
              // Not JSON — keep scanning.
            }
          }
        });
        proc.stderr.on('data', (d: Buffer) => stderrBuf.push(d.toString('utf8')));
        proc.on('error', (err) => { clearTimeout(timer); rejectP(err); });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (!started) {
            rejectP(new Error(
              `api process exited (code=${String(code)}) before emitting api:started.\nSTDOUT:\n${stdoutBuf.join('')}\nSTDERR:\n${stderrBuf.join('')}`,
            ));
          }
        });
      });
      assert.ok(started, 'api:started log line must be emitted');
    } finally {
      // Stop the container if still running.
      try {
        await runDocker(['stop', '-t', '2', containerName], { timeoutMs: 10_000 });
      } catch {
        // Container may already be gone.
      }
    }
  },
);

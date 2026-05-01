import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

test('api boots, serves /list, shuts down cleanly', { timeout: 30000 }, async () => {
  const child = spawn('npx', ['tsx', 'server/api/index.ts'], {
    env: { ...process.env, SIGNALMAP_API_PORT: '3399', SIGNALMAP_BACKEND_MODE: 'fixture' },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    // Wait for "api:started" log line
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('boot timeout: api:started not seen within 10s')), 10000);
      let buf = '';

      child.stdout.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        const lines = buf.split('\n');
        // Keep the last incomplete line in buf
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj['event'] === 'api:started' && typeof obj['port'] === 'number') {
              clearTimeout(timer);
              resolve(obj['port'] as number);
              return;
            }
          } catch {
            // not JSON, skip
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      // Only reject on early exit if we haven't resolved yet
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`child exited before listen: code=${String(code)}`));
      });
    });

    assert.equal(port, 3399, 'api:started port must match SIGNALMAP_API_PORT');

    // Fetch /api/signalmap/list
    const res = await fetch(`http://127.0.0.1:${port}/api/signalmap/list`);
    assert.equal(res.status, 200, `/list must return 200`);
    const body = await res.json() as Record<string, unknown>;
    assert.ok('events' in body, 'response body must have an "events" key');
    assert.ok(Array.isArray(body['events']), '"events" must be an array');

    // Verify 404 for unknown path
    const missing = await fetch(`http://127.0.0.1:${port}/api/missing`);
    assert.equal(missing.status, 404, 'unknown path must return 404');

    // Trigger shutdown via stdin (cross-platform) AND SIGTERM (POSIX belt-and-suspenders)
    child.stdin.write('SHUTDOWN\n');
    child.kill('SIGTERM');

    // Wait for clean exit within 5s
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('shutdown timeout: process did not exit within 5s')), 5000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // Accept code 0 (graceful) or null (Windows abrupt termination) — assert it exited
    assert.ok(
      exitCode === 0 || exitCode === null,
      `unexpected exit code: ${String(exitCode)}`,
    );
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});

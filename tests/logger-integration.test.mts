import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

test('api emits first stdout line as parseable JSON with service: "api"', { timeout: 30000 }, async () => {
  const child = spawn('npx', ['tsx', 'server/api/index.ts'], {
    env: { ...process.env, SIGNALMAP_API_PORT: '3398', SIGNALMAP_BACKEND_MODE: 'fixture' },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    // Wait up to 10s for the first stdout JSON line
    const parsed = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timeout: no JSON line seen on stdout within 10s')),
        10000,
      );
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
            clearTimeout(timer);
            resolve(obj);
            return;
          } catch {
            // not JSON, skip
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`child exited before emitting JSON: code=${String(code)}`));
      });
    });

    // Assert structured log fields
    assert.equal(parsed['service'], 'api', 'service must be "api"');
    assert.equal(parsed['event'], 'api:started', 'event must be "api:started"');
    assert.equal(typeof parsed['ts'], 'string', 'ts must be a string (ISO)');
    assert.equal(parsed['level'], 'info', 'level must be "info"');

    // Belt-and-suspenders shutdown (mirrors api-boot.test.mts:67-69)
    child.stdin.write('SHUTDOWN\n');
    child.kill('SIGTERM');

    // Wait up to 5s for exit
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('shutdown timeout: process did not exit within 5s')),
        5000,
      );
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // Accept 0 (graceful) or null (Windows abrupt termination)
    assert.ok(
      exitCode === 0 || exitCode === null,
      `unexpected exit code: ${String(exitCode)}`,
    );
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});

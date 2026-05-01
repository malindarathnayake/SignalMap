import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

test('live mode without REDIS_URL exits non-zero with redis:required-in-live-mode event', { timeout: 15000 }, async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, SIGNALMAP_API_PORT: '3398', SIGNALMAP_BACKEND_MODE: 'live' };
  delete env.REDIS_URL;

  const child = spawn('npx', ['tsx', 'server/api/index.ts'], {
    env,
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    const { exitCode, combined } = await new Promise<{ exitCode: number | null; combined: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout: process did not exit within 8s')), 8000);
      let combined = '';

      child.stdout.on('data', (d: Buffer) => {
        combined += d.toString('utf8');
      });
      child.stderr.on('data', (d: Buffer) => {
        combined += d.toString('utf8');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, combined });
      });
    });

    assert.notEqual(exitCode, 0, `expected non-zero exit code, got: ${String(exitCode)}`);
    // Find the matching JSON line and parse it. Tolerate prefixed text on the same
    // line (warnings printed before our line) by scanning per-line.
    const lines = combined.split('\n');
    let parsed: Record<string, unknown> | null = null;
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (obj['event'] === 'redis:required-in-live-mode') {
          parsed = obj;
          break;
        }
      } catch {
        // not JSON, skip
      }
    }
    assert.ok(parsed, `expected a JSON line with event "redis:required-in-live-mode" in output, got:\n${combined}`);
    assert.equal(parsed!['level'], 'error', 'event line must have level=error');
    assert.equal(parsed!['service'], 'api', 'event line must have service=api');
    assert.equal(parsed!['event'], 'redis:required-in-live-mode', 'event field must match');
    assert.ok(typeof parsed!['ts'] === 'string' && (parsed!['ts'] as string).length > 0, 'ts must be a non-empty string');
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});

test('fixture mode without REDIS_URL boots successfully', { timeout: 20000 }, async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, SIGNALMAP_API_PORT: '3397', SIGNALMAP_BACKEND_MODE: 'fixture' };
  delete env.REDIS_URL;

  const child = spawn('npx', ['tsx', 'server/api/index.ts'], {
    env,
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('boot timeout: api:started not seen within 10s')), 10000);
      let buf = '';

      child.stdout.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj['event'] === 'api:started') {
              clearTimeout(timer);
              resolve();
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

      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`child exited before api:started: code=${String(code)}`));
      });
    });

    // Trigger shutdown via stdin AND SIGTERM (mirrors api-boot.test.mts:67-69)
    child.stdin.write('SHUTDOWN\n');
    child.kill('SIGTERM');

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('shutdown timeout: process did not exit within 5s')), 5000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // Accept code 0 (graceful) or null (Windows abrupt termination)
    assert.ok(
      exitCode === 0 || exitCode === null,
      `unexpected exit code: ${String(exitCode)}`,
    );
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});

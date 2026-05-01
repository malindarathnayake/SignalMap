/**
 * Phase 7.5a — JSONL regression harness for api / collector / cron.
 *
 * For each service:
 *   1. Spawns the service in fixture mode.
 *   2. Captures all stdout into an in-memory buffer.
 *   3. Waits for the service's bootstrap event line.
 *   4. Sends SHUTDOWN to stdin (+ SIGTERM on POSIX).
 *   5. Waits for `close` with an 8s timeout + force-kill fallback.
 *   6. Writes the raw captured buffer to a unique temp file.
 *   7. Runs scripts/validate-jsonl.mjs against the temp file.
 *   8. Asserts exit 0 and "validated N JSON line(s)" with N >= 1.
 *
 * Prerequisites:
 *   - Redis must be reachable at redis://localhost:6380
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ServiceConfig {
  name: string;
  command: string[];
  env: Record<string, string>;
  bootstrapEvent: string;
  cleanKeys: string[];
}

async function runServiceAndValidate(cfg: ServiceConfig): Promise<void> {
  const { name, command, env, bootstrapEvent, cleanKeys } = cfg;

  const redis = new Redis('redis://localhost:6380', {
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  await redis.connect();
  const pong = await redis.ping();
  assert.equal(pong, 'PONG', 'Redis PING must return PONG — is Redis running?');

  // Pre-clean keys to avoid ghost state from prior runs
  if (cleanKeys.length > 0) {
    await redis.del(...cleanKeys);
  }

  const proc = spawn('npx', command, {
    env: { ...process.env, ...env },
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  // Accumulate ALL raw stdout bytes into this buffer
  const stdoutChunks: string[] = [];
  const stderrLines: string[] = [];
  let bootstrapSeen = false;

  proc.stderr.on('data', (d: Buffer) => {
    stderrLines.push(d.toString('utf8'));
  });

  const tmpPath = join(tmpdir(), `signalmap-${name}-${randomUUID()}.jsonl`);

  try {
    // ── 1. Wait for bootstrap event ───────────────────────────────────────────
    await new Promise<void>((resolveP, rejectP) => {
      const timer = setTimeout(() => {
        const combined =
          'STDOUT:\n' + stdoutChunks.join('') + '\nSTDERR:\n' + stderrLines.join('');
        rejectP(
          new Error(
            `${bootstrapEvent} not seen within 25s for service "${name}".\n${combined}`,
          ),
        );
      }, 25_000);

      let lineBuf = '';

      proc.stdout.on('data', (d: Buffer) => {
        const chunk = d.toString('utf8');
        // Capture raw bytes for later writing to disk
        stdoutChunks.push(chunk);

        // Also scan for bootstrap event line-by-line
        lineBuf += chunk;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          let obj: Record<string, unknown> | null = null;
          try {
            obj = JSON.parse(line) as Record<string, unknown>;
          } catch {
            // not JSON — skip for bootstrap detection
          }
          if (obj === null) continue;

          if (obj['event'] === bootstrapEvent) {
            bootstrapSeen = true;
            clearTimeout(timer);
            resolveP();
            return;
          }
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        rejectP(err);
      });

      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (!bootstrapSeen) {
          rejectP(
            new Error(
              `"${name}" process exited (code=${String(code)}) before emitting ${bootstrapEvent}.\n` +
                'STDOUT:\n' + stdoutChunks.join('') +
                '\nSTDERR:\n' + stderrLines.join(''),
            ),
          );
        }
      });
    });

    assert.ok(bootstrapSeen, `bootstrap event "${bootstrapEvent}" must have been seen`);

    // ── 2. Shut down the service ───────────────────────────────────────────────
    proc.stdin.write('SHUTDOWN\n');
    if (process.platform !== 'win32') {
      proc.kill('SIGTERM');
    }

    const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
      const exitTimer = setTimeout(() => {
        // Force-kill on timeout
        if (process.platform === 'win32') {
          proc.kill();
        } else {
          proc.kill('SIGKILL');
        }
        rejectExit(new Error(`"${name}" did not exit within 8s after shutdown signal`));
      }, 8_000);

      proc.on('close', (code) => {
        clearTimeout(exitTimer);
        resolveExit(code);
      });
    });

    // Windows with shell:true may return null; POSIX should return 0 or 1
    assert.ok(
      exitCode === 0 || exitCode === null || exitCode === 1,
      `unexpected exit code after shutdown for "${name}": ${String(exitCode)}`,
    );

    // ── 3. Write captured stdout to a unique tmp file ─────────────────────────
    const rawBuffer = stdoutChunks.join('');
    writeFileSync(tmpPath, rawBuffer, 'utf8');

    // ── 4. Run the validator ──────────────────────────────────────────────────
    const result = spawnSync(
      process.execPath,
      [resolve(REPO_ROOT, 'scripts/validate-jsonl.mjs'), tmpPath],
      { encoding: 'utf-8' },
    );

    const diagnostics = (result.stderr ?? '') + (result.stdout ?? '');

    assert.equal(
      result.status,
      0,
      `validate-jsonl.mjs must exit 0 for service "${name}".\nOutput:\n${diagnostics}`,
    );

    assert.match(
      result.stdout ?? '',
      /validated \d+ JSON line\(s\)/,
      `validate-jsonl.mjs stdout must contain "validated N JSON line(s)" for service "${name}".\nOutput:\n${diagnostics}`,
    );

    const match = (result.stdout ?? '').match(/validated (\d+) JSON line\(s\)/);
    const lineCount = match ? parseInt(match[1], 10) : 0;
    assert.ok(
      lineCount >= 1,
      `validator must report at least 1 valid JSON line for service "${name}", got ${String(lineCount)}.\nOutput:\n${diagnostics}`,
    );
  } finally {
    // Cleanup: kill child if still alive, delete tmp file, post-clean Redis keys, quit redis
    if (!proc.killed) {
      try {
        proc.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      } catch {
        // ignore
      }
    }

    try {
      unlinkSync(tmpPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // swallow ENOENT, rethrow unexpected errors
        throw err;
      }
    }

    if (cleanKeys.length > 0) {
      await redis.del(...cleanKeys).catch(() => undefined);
    }
    await redis.quit().catch(() => undefined);
  }
}

// ─── Subtest 1: API ───────────────────────────────────────────────────────────

test('api logs validate as JSONL', { timeout: 60_000 }, async () => {
  await runServiceAndValidate({
    name: 'api',
    command: ['tsx', 'server/api/index.ts'],
    env: {
      SIGNALMAP_API_PORT: '3397',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      REDIS_URL: 'redis://localhost:6380',
    },
    bootstrapEvent: 'api:started',
    cleanKeys: [],
  });
});

// ─── Subtest 2: Collector ─────────────────────────────────────────────────────

test('collector logs validate as JSONL', { timeout: 60_000 }, async () => {
  await runServiceAndValidate({
    name: 'collector',
    command: ['tsx', 'server/workers/collector.ts'],
    env: {
      SIGNALMAP_RSS_POLL_MINUTES: '0.05',
      SIGNALMAP_COLLECTOR_LEASE_TTL_SEC: '5',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      REDIS_URL: 'redis://localhost:6380',
      SIGNALMAP_VECTOR_ENABLED: 'false',
    },
    bootstrapEvent: 'collector-tick-success',
    cleanKeys: [
      'signalmap:collector:lease',
      'signalmap:collector:heartbeat',
      'signalmap:collector:status',
    ],
  });
});

// ─── Subtest 3: Cron ──────────────────────────────────────────────────────────

test('cron logs validate as JSONL', { timeout: 60_000 }, async () => {
  const today = new Date().toISOString().slice(0, 10);
  const spendKey = `signalmap:llm:spend:${today}`;

  await runServiceAndValidate({
    name: 'cron',
    command: ['tsx', 'server/workers/cron.ts'],
    env: {
      SIGNALMAP_BRIEF_REFRESH_MINUTES: '0.05',
      SIGNALMAP_CRON_LEASE_TTL_SEC: '5',
      SIGNALMAP_BACKEND_MODE: 'fixture',
      SIGNALMAP_CRON_TEST_FIXTURE: '1',
      REDIS_URL: 'redis://localhost:6380',
      OPENROUTER_API_KEY: 'test-key',
      SIGNALMAP_DAILY_LLM_BUDGET_USD: '100',
    },
    bootstrapEvent: 'cron-tick-success',
    cleanKeys: [
      'signalmap:brief:cron:lease',
      'signalmap:brief:cron:heartbeat',
      'signalmap:brief:cron:status',
      'signalmap:brief:global',
      spendKey,
    ],
  });
});

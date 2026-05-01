/**
 * Phase 9b — docker-compose.yml negative-path test.
 *
 * Asserts that `docker compose config` fails fast with a non-zero exit code
 * when required env vars are missing. The compose file uses `${VAR:?message}`
 * syntax for `REDIS_PASSWORD` and `SIGNALMAP_ADMIN_TOKEN_FILE`, so those vars
 * must be present or compose refuses to start — proving the security guardrail
 * works under accidental misconfig.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

class DockerNotInstalledError extends Error {
  constructor() {
    super('docker is not installed or not reachable');
    this.name = 'DockerNotInstalledError';
  }
}

/**
 * Build a process env that excludes the listed keys.
 * Starts from `process.env` so PATH and other host essentials are preserved.
 */
function envWithout(...keys: string[]): NodeJS.ProcessEnv {
  const filtered: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!keys.includes(k)) filtered[k] = v;
  }
  return filtered;
}

function runComposeConfig(
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
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
      try {
        proc.kill();
      } catch {
        /* noop */
      }
      rejectP(new Error('docker compose config timed out after 30s'));
    }, 30_000);
    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        rejectP(new DockerNotInstalledError());
      } else {
        rejectP(err);
      }
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

test(
  'missing REDIS_PASSWORD makes docker compose config fail-fast',
  { timeout: 60_000 },
  async (t) => {
    // Provide SIGNALMAP_ADMIN_TOKEN_FILE but strip REDIS_PASSWORD
    const env: NodeJS.ProcessEnv = {
      ...envWithout('REDIS_PASSWORD'),
      // Ensure REDIS_PASSWORD is absent — override any inherited value with nothing
      // by not including it at all (envWithout already strips it)
      SIGNALMAP_ADMIN_TOKEN_FILE: './secrets/SIGNALMAP_ADMIN_TOKEN.example',
    };
    // Also explicitly delete the key in case envWithout missed it via process.env quirks
    delete env['REDIS_PASSWORD'];

    let result: { code: number | null; stdout: string; stderr: string };
    try {
      result = await runComposeConfig(env);
    } catch (err) {
      if (err instanceof DockerNotInstalledError) {
        t.skip('docker not installed');
        return;
      }
      throw err;
    }

    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit when REDIS_PASSWORD is missing; got ${String(result.code)}\nSTDERR:\n${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('REDIS_PASSWORD must be set in .env'),
      `expected stderr to contain 'REDIS_PASSWORD must be set in .env'; got:\n${result.stderr}`,
    );
  },
);

test(
  'missing SIGNALMAP_ADMIN_TOKEN_FILE makes docker compose config fail-fast',
  { timeout: 60_000 },
  async (t) => {
    // Provide REDIS_PASSWORD but strip SIGNALMAP_ADMIN_TOKEN_FILE
    const env: NodeJS.ProcessEnv = {
      ...envWithout('SIGNALMAP_ADMIN_TOKEN_FILE'),
      REDIS_PASSWORD: 'test-password',
    };
    // Explicitly delete in case envWithout missed it
    delete env['SIGNALMAP_ADMIN_TOKEN_FILE'];

    let result: { code: number | null; stdout: string; stderr: string };
    try {
      result = await runComposeConfig(env);
    } catch (err) {
      if (err instanceof DockerNotInstalledError) {
        t.skip('docker not installed');
        return;
      }
      throw err;
    }

    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit when SIGNALMAP_ADMIN_TOKEN_FILE is missing; got ${String(result.code)}\nSTDERR:\n${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('SIGNALMAP_ADMIN_TOKEN_FILE must point at the secret file'),
      `expected stderr to contain 'SIGNALMAP_ADMIN_TOKEN_FILE must point at the secret file'; got:\n${result.stderr}`,
    );
  },
);

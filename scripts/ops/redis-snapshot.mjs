/**
 * redis-snapshot.mjs — Redis BGSAVE snapshot + restore operator tool for SignalMap.
 *
 * Snapshot procedure (save):
 *   REDIS_PASSWORD=<pw> node scripts/ops/redis-snapshot.mjs save [--out ./backups/redis-<ts>.rdb]
 *
 *   Issues a non-blocking BGSAVE, polls LASTSAVE until it advances (≤ 30 s),
 *   then docker-copies dump.rdb out of the container.
 *
 * Restore procedure:
 *   REDIS_PASSWORD=<pw> node scripts/ops/redis-snapshot.mjs restore --in ./backups/redis-<ts>.rdb
 *
 *   Stops signalmap-redis, replaces dump.rdb, starts signalmap-redis,
 *   then polls redis-cli PING until PONG (≤ 30 s).
 *
 * Verify:
 *   REDIS_PASSWORD=<pw> node scripts/ops/redis-snapshot.mjs verify
 *
 *   Prints DBSIZE (key count). Exit 0 on success, 1 on auth/connection failure.
 *
 * Add --dry-run to print the plan without executing any Docker commands.
 *
 * Reads REDIS_PASSWORD from the environment. Container name: signalmap-redis.
 *
 * Usage:
 *   node scripts/ops/redis-snapshot.mjs save [--out <path>] [--dry-run]
 *   node scripts/ops/redis-snapshot.mjs restore --in <path> [--dry-run]
 *   node scripts/ops/redis-snapshot.mjs verify
 */

// @ts-check

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CONTAINER_NAME = 'signalmap-redis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command and return { code, stdout, stderr }.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ code: number; stdout: string; stderr: string }>}
 */
function runCapture(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    const out = /** @type {string[]} */ ([]);
    const err = /** @type {string[]} */ ([]);
    proc.stdout.on('data', (d) => out.push(d.toString('utf8')));
    proc.stderr.on('data', (d) => err.push(d.toString('utf8')));
    proc.on('close', (code) => resolve({ code: code ?? 1, stdout: out.join(''), stderr: err.join('') }));
    proc.on('error', reject);
  });
}

/**
 * Run a command with inherited stdio. Resolves with exit code.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<number>}
 */
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', reject);
  });
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns an ISO timestamp safe for filenames (colons replaced with dashes).
 */
function isoTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Redis CLI helpers
// ---------------------------------------------------------------------------

/**
 * Run redis-cli inside the container.
 * @param {string} password
 * @param {string[]} cliArgs
 * @returns {Promise<{ code: number; stdout: string; stderr: string }>}
 */
function redisCli(password, cliArgs) {
  return runCapture('docker', [
    'exec',
    CONTAINER_NAME,
    'redis-cli',
    '-a', password,
    '--no-auth-warning',
    ...cliArgs,
  ]);
}

/**
 * Get the current LASTSAVE unix timestamp from Redis.
 * @param {string} password
 * @returns {Promise<number>}
 */
async function getLastSave(password) {
  const result = await redisCli(password, ['LASTSAVE']);
  const ts = parseInt(result.stdout.trim(), 10);
  if (isNaN(ts)) throw new Error(`LASTSAVE returned unexpected value: ${result.stdout.trim()}`);
  return ts;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * @param {string} password
 * @param {string} outPath
 * @param {boolean} dryRun
 */
async function cmdSave(password, outPath, dryRun) {
  const absOut = resolve(REPO_ROOT, outPath);
  const outDir = dirname(absOut);

  console.log('[plan] save Redis snapshot');
  console.log(`[plan]   1. BGSAVE in container ${CONTAINER_NAME}`);
  console.log(`[plan]   2. Poll LASTSAVE to confirm dump complete (≤ 30 s)`);
  console.log(`[plan]   3. docker cp ${CONTAINER_NAME}:/data/dump.rdb ${absOut}`);

  if (dryRun) {
    console.log('[dry-run] Exiting without executing. Remove --dry-run to perform save.');
    process.exit(0);
  }

  // Ensure output dir exists
  if (!existsSync(outDir)) {
    console.log(`[info] Creating directory: ${outDir}`);
    mkdirSync(outDir, { recursive: true });
  }

  // Step 1: Get pre-BGSAVE LASTSAVE
  let preSave;
  try {
    preSave = await getLastSave(password);
  } catch (err) {
    console.error(`[error] Cannot connect to Redis: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`[info] pre-BGSAVE LASTSAVE: ${preSave}`);

  // Step 2: Issue BGSAVE
  console.log('[step 1] Issuing BGSAVE...');
  const bgsaveResult = await redisCli(password, ['BGSAVE']);
  if (bgsaveResult.code !== 0) {
    console.error(`[error] BGSAVE failed: ${bgsaveResult.stderr.trim() || bgsaveResult.stdout.trim()}`);
    process.exit(1);
  }
  console.log(`[info] BGSAVE response: ${bgsaveResult.stdout.trim()}`);

  // Step 3: Poll LASTSAVE until it advances
  console.log('[step 2] Polling LASTSAVE for completion (≤ 30 s)...');
  const deadline = Date.now() + 30_000;
  let completed = false;
  while (Date.now() < deadline) {
    await sleep(1_000);
    try {
      const ts = await getLastSave(password);
      console.log(`[poll] LASTSAVE: ${ts} (need > ${preSave})`);
      if (ts > preSave) {
        completed = true;
        console.log('[info] Dump complete.');
        break;
      }
    } catch (err) {
      console.warn(`[warn] LASTSAVE poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!completed) {
    console.error('[error] BGSAVE did not complete within 30 s. dump.rdb may be stale.');
    process.exit(1);
  }

  // Step 4: docker cp
  console.log(`[step 3] Copying dump.rdb to ${absOut}...`);
  const cpCode = await run('docker', ['cp', `${CONTAINER_NAME}:/data/dump.rdb`, absOut]);
  if (cpCode !== 0) {
    console.error(`[error] docker cp failed with exit code ${cpCode}`);
    process.exit(1);
  }

  console.log(`[ok] Redis snapshot saved to: ${absOut}`);
  process.exit(0);
}

/**
 * @param {string} password
 * @param {string} inPath
 * @param {boolean} dryRun
 */
async function cmdRestore(password, inPath, dryRun) {
  const absIn = resolve(REPO_ROOT, inPath);

  console.log('[plan] restore Redis snapshot');
  console.log(`[plan]   1. Verify snapshot file exists: ${absIn}`);
  console.log(`[plan]   2. docker compose stop ${CONTAINER_NAME}`);
  console.log(`[plan]   3. docker cp ${absIn} ${CONTAINER_NAME}:/data/dump.rdb`);
  console.log(`[plan]   4. docker compose start ${CONTAINER_NAME}`);
  console.log(`[plan]   5. Poll redis-cli PING until PONG (≤ 30 s)`);

  if (!existsSync(absIn)) {
    console.error(`[error] Snapshot file not found: ${absIn}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[dry-run] File exists. Exiting without executing. Remove --dry-run to perform restore.');
    process.exit(0);
  }

  // Step 1: Stop redis
  console.log(`[step 1] Stopping ${CONTAINER_NAME}...`);
  const stopCode = await run('docker', ['compose', 'stop', CONTAINER_NAME]);
  if (stopCode !== 0) {
    console.error(`[error] docker compose stop failed with exit code ${stopCode}`);
    process.exit(1);
  }

  // Step 2: Copy snapshot in
  console.log(`[step 2] Copying ${absIn} -> ${CONTAINER_NAME}:/data/dump.rdb...`);
  const cpCode = await run('docker', ['cp', absIn, `${CONTAINER_NAME}:/data/dump.rdb`]);
  if (cpCode !== 0) {
    console.error(`[error] docker cp failed with exit code ${cpCode}`);
    process.exit(1);
  }

  // Step 3: Start redis
  console.log(`[step 3] Starting ${CONTAINER_NAME}...`);
  const startCode = await run('docker', ['compose', 'start', CONTAINER_NAME]);
  if (startCode !== 0) {
    console.error(`[error] docker compose start failed with exit code ${startCode}`);
    process.exit(1);
  }

  // Step 4: Poll PING
  console.log('[step 4] Polling redis-cli PING until PONG (≤ 30 s)...');
  const deadline = Date.now() + 30_000;
  let alive = false;
  while (Date.now() < deadline) {
    await sleep(1_000);
    const result = await redisCli(password, ['PING']);
    const resp = result.stdout.trim();
    console.log(`[poll] PING -> ${resp}`);
    if (resp === 'PONG') {
      alive = true;
      break;
    }
  }

  if (!alive) {
    console.error('[error] Redis did not respond with PONG within 30 s after restore.');
    process.exit(1);
  }

  console.log('[ok] Redis restored and healthy.');
  process.exit(0);
}

/**
 * @param {string} password
 */
async function cmdVerify(password) {
  console.log('[verify] Calling DBSIZE on Redis...');
  const result = await redisCli(password, ['DBSIZE']);
  if (result.code !== 0) {
    console.error(`[error] DBSIZE failed (auth/connection error): ${result.stderr.trim() || result.stdout.trim()}`);
    process.exit(1);
  }
  const keyCount = result.stdout.trim();
  console.log(`[ok] Redis key count: ${keyCount}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const printUsage = () => {
    console.error(
      'Usage:\n' +
      '  node scripts/ops/redis-snapshot.mjs save [--out <path>] [--dry-run]\n' +
      '  node scripts/ops/redis-snapshot.mjs restore --in <path> [--dry-run]\n' +
      '  node scripts/ops/redis-snapshot.mjs verify\n' +
      '\n' +
      'Requires REDIS_PASSWORD environment variable.\n' +
      '\n' +
      'Examples:\n' +
      '  REDIS_PASSWORD=secret node scripts/ops/redis-snapshot.mjs save\n' +
      '  REDIS_PASSWORD=secret node scripts/ops/redis-snapshot.mjs save --out ./backups/my.rdb\n' +
      '  REDIS_PASSWORD=secret node scripts/ops/redis-snapshot.mjs restore --in ./backups/redis-2026-04-30.rdb\n' +
      '  REDIS_PASSWORD=secret node scripts/ops/redis-snapshot.mjs verify\n',
    );
  };

  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const password = process.env['REDIS_PASSWORD'];
  if (!password) {
    console.error('[error] set REDIS_PASSWORD before running');
    process.exit(1);
  }

  if (command === 'save') {
    let outPath = `./backups/redis-${isoTimestamp()}.rdb`;
    let dryRun = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--out' && args[i + 1]) {
        outPath = args[++i];
      } else if (args[i] === '--dry-run') {
        dryRun = true;
      } else {
        console.error(`[error] Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
      }
    }
    await cmdSave(password, outPath, dryRun);
  } else if (command === 'restore') {
    let inPath = '';
    let dryRun = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--in' && args[i + 1]) {
        inPath = args[++i];
      } else if (args[i] === '--dry-run') {
        dryRun = true;
      } else {
        console.error(`[error] Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
      }
    }
    if (!inPath) {
      console.error('[error] restore requires --in <path>');
      printUsage();
      process.exit(1);
    }
    await cmdRestore(password, inPath, dryRun);
  } else if (command === 'verify') {
    await cmdVerify(password);
  } else {
    console.error(`[error] Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

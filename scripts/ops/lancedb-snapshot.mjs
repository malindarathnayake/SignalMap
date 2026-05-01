/**
 * lancedb-snapshot.mjs — LanceDB volume snapshot + restore operator tool for SignalMap.
 *
 * Operates on the named Docker volume: signalmap-lancedb.
 * signalmap-collector is the sole writer to this volume.
 *
 * Snapshot procedure (save):
 *   node scripts/ops/lancedb-snapshot.mjs save [--out ./backups/lancedb-<ts>.tar.gz]
 *
 *   Uses `docker run --rm -v signalmap-lancedb:/data -v <out-dir>:/backup alpine tar -czf ...`
 *   so the snapshot is consistent without any application-level coordination.
 *   (The collector is NOT stopped for save — alpine tar reads the volume directly.)
 *
 * Restore procedure:
 *   node scripts/ops/lancedb-snapshot.mjs restore --in ./backups/lancedb-<ts>.tar.gz
 *
 *   Stops signalmap-collector (the only writer), replaces volume contents via
 *   alpine tar, then restarts signalmap-collector.
 *
 * Add --dry-run to print the plan without executing any Docker commands.
 *
 * Usage:
 *   node scripts/ops/lancedb-snapshot.mjs save [--out <path>] [--dry-run]
 *   node scripts/ops/lancedb-snapshot.mjs restore --in <path> [--dry-run]
 */

// @ts-check

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const VOLUME_NAME = 'signalmap-lancedb';
const COLLECTOR_SERVICE = 'signalmap-collector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Returns an ISO timestamp safe for filenames (colons replaced with dashes).
 */
function isoTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * @param {string} outPath  Path to the output .tar.gz file
 * @param {boolean} dryRun
 */
async function cmdSave(outPath, dryRun) {
  const absOut = resolve(REPO_ROOT, outPath);
  const absOutDir = dirname(absOut);
  const archiveName = basename(absOut);

  // Normalize to posix-style path for Docker volume mount on Windows hosts
  // docker accepts forward slashes in volume bind mounts on Windows
  const dockerOutDir = absOutDir.replace(/\\/g, '/');

  console.log('[plan] save LanceDB volume snapshot');
  console.log(`[plan]   volume: ${VOLUME_NAME}`);
  console.log(`[plan]   output: ${absOut}`);
  console.log('[plan]   command:');
  console.log(`[plan]     docker run --rm -v ${VOLUME_NAME}:/data -v "${dockerOutDir}:/backup" alpine tar -czf /backup/${archiveName} -C / data`);

  if (dryRun) {
    console.log('[dry-run] Exiting without executing. Remove --dry-run to perform save.');
    process.exit(0);
  }

  // Ensure output dir exists
  if (!existsSync(absOutDir)) {
    console.log(`[info] Creating directory: ${absOutDir}`);
    mkdirSync(absOutDir, { recursive: true });
  }

  console.log('[step 1] Running alpine tar to snapshot volume...');
  const code = await run('docker', [
    'run', '--rm',
    '-v', `${VOLUME_NAME}:/data`,
    '-v', `${absOutDir}:/backup`,
    'alpine',
    'tar', '-czf', `/backup/${archiveName}`,
    '-C', '/',
    'data',
  ]);

  if (code !== 0) {
    console.error(`[error] docker run alpine tar failed with exit code ${code}`);
    process.exit(1);
  }

  console.log(`[ok] LanceDB snapshot saved to: ${absOut}`);
  process.exit(0);
}

/**
 * @param {string} inPath  Path to the .tar.gz file to restore
 * @param {boolean} dryRun
 */
async function cmdRestore(inPath, dryRun) {
  const absIn = resolve(REPO_ROOT, inPath);
  const absInDir = dirname(absIn);
  const archiveName = basename(absIn);

  const dockerInDir = absInDir.replace(/\\/g, '/');

  console.log('[plan] restore LanceDB volume snapshot');
  console.log(`[plan]   volume:   ${VOLUME_NAME}`);
  console.log(`[plan]   snapshot: ${absIn}`);
  console.log(`[plan]   1. Verify snapshot file exists`);
  console.log(`[plan]   2. docker compose stop ${COLLECTOR_SERVICE}`);
  console.log(`[plan]   3. docker run --rm -v ${VOLUME_NAME}:/data -v "${dockerInDir}:/backup" alpine sh -c "rm -rf /data/* && tar -xzf /backup/${archiveName} -C /"`);
  console.log(`[plan]   4. docker compose start ${COLLECTOR_SERVICE}`);

  if (!existsSync(absIn)) {
    console.error(`[error] Snapshot file not found: ${absIn}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[dry-run] File exists. Exiting without executing. Remove --dry-run to perform restore.');
    process.exit(0);
  }

  // Step 1: Stop collector
  console.log(`[step 1] Stopping ${COLLECTOR_SERVICE}...`);
  const stopCode = await run('docker', ['compose', 'stop', COLLECTOR_SERVICE]);
  if (stopCode !== 0) {
    console.error(`[error] docker compose stop failed with exit code ${stopCode}`);
    process.exit(1);
  }

  // Step 2: Replace volume contents
  console.log('[step 2] Restoring volume contents from snapshot...');
  const restoreCode = await run('docker', [
    'run', '--rm',
    '-v', `${VOLUME_NAME}:/data`,
    '-v', `${absInDir}:/backup`,
    'alpine',
    'sh', '-c', `rm -rf /data/* && tar -xzf /backup/${archiveName} -C /`,
  ]);
  if (restoreCode !== 0) {
    console.error(`[error] Volume restore failed with exit code ${restoreCode}`);
    console.error(`[warn]  ${COLLECTOR_SERVICE} is stopped. Restart it manually after diagnosing the issue.`);
    process.exit(1);
  }

  // Step 3: Restart collector
  console.log(`[step 3] Starting ${COLLECTOR_SERVICE}...`);
  const startCode = await run('docker', ['compose', 'start', COLLECTOR_SERVICE]);
  if (startCode !== 0) {
    console.error(`[error] docker compose start failed with exit code ${startCode}`);
    process.exit(1);
  }

  console.log(`[ok] LanceDB volume restored from: ${absIn}`);
  console.log(`[ok] ${COLLECTOR_SERVICE} restarted.`);
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
      '  node scripts/ops/lancedb-snapshot.mjs save [--out <path>] [--dry-run]\n' +
      '  node scripts/ops/lancedb-snapshot.mjs restore --in <path> [--dry-run]\n' +
      '\n' +
      'Examples:\n' +
      '  node scripts/ops/lancedb-snapshot.mjs save\n' +
      '  node scripts/ops/lancedb-snapshot.mjs save --out ./backups/lancedb-before-deploy.tar.gz\n' +
      '  node scripts/ops/lancedb-snapshot.mjs restore --in ./backups/lancedb-2026-04-30T12-00-00Z.tar.gz\n' +
      '  node scripts/ops/lancedb-snapshot.mjs save --dry-run\n',
    );
  };

  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === 'save') {
    let outPath = `./backups/lancedb-${isoTimestamp()}.tar.gz`;
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
    await cmdSave(outPath, dryRun);
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
    await cmdRestore(inPath, dryRun);
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

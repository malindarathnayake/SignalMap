/**
 * rollback-image.mjs — Image rollback operator tool for SignalMap v2-backend.
 *
 * Rollback procedure:
 *   1. Identify the last-known-good Docker image tag (e.g. from CI release tags).
 *   2. Run: node scripts/ops/rollback-image.mjs --service <service> --tag <tag>
 *   3. The script pulls the image, re-tags it as :latest, and brings the service
 *      back up via `docker compose up -d --no-build`. Health is polled for 60 s.
 *   4. Add --dry-run to print the plan without executing any Docker commands.
 *
 * Usage:
 *   node scripts/ops/rollback-image.mjs --service <signalmap-api|signalmap-collector|signalmap-cron|signalmap-ui> --tag <docker-image-tag> [--dry-run]
 *
 * Supported services: signalmap-api, signalmap-collector, signalmap-cron, signalmap-ui
 */

// @ts-check

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const VALID_SERVICES = [
  'signalmap-api',
  'signalmap-collector',
  'signalmap-cron',
  'signalmap-ui',
];

// ---------------------------------------------------------------------------
// Minimal YAML image parser — walks lines to find the image key under a service
// block. Not a generic parser; handles the signalmap compose format.
// ---------------------------------------------------------------------------

/**
 * @param {string} yamlText
 * @param {string} service
 * @returns {string | null}
 */
function readImageForService(yamlText, service) {
  const lines = yamlText.split('\n');
  let inServicesBlock = false;
  let inTargetService = false;
  let serviceIndent = -1;
  let inBuildBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimEnd();
    const content = trimmed.trimStart();

    // Track the top-level "services:" block
    if (!inServicesBlock) {
      if (trimmed === 'services:') {
        inServicesBlock = true;
      }
      continue;
    }

    // Inside services block — detect service entries (2-space or 4-space indent)
    const indent = trimmed.length - content.length;

    if (inTargetService) {
      // A line with equal or lower indent than the service key = we've left the service block
      if (content !== '' && indent <= serviceIndent) {
        inTargetService = false;
        inBuildBlock = false;
        // Fall through to check if this is a new matching service (unlikely but safe)
      } else {
        // Skip build: sub-block to avoid matching 'image:' inside build args
        if (content === 'build:') {
          inBuildBlock = true;
          continue;
        }
        if (inBuildBlock) {
          // build block ends when we return to service-level indent
          if (content !== '' && indent <= serviceIndent + 2) {
            inBuildBlock = false;
          } else {
            continue;
          }
        }
        const imageMatch = content.match(/^image:\s*(.+)$/);
        if (imageMatch) {
          return imageMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }
        continue;
      }
    }

    // Detect a service name line: "  <name>:" with consistent indent
    const serviceMatch = content.match(/^(\S+):$/);
    if (serviceMatch && serviceMatch[1] === service) {
      inTargetService = true;
      serviceIndent = indent;
      inBuildBlock = false;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Spawn a child process and stream its stdio. Resolves with exit code.
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
 * Spawn silently and return { code, stdout, stderr }.
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

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Health polling
// ---------------------------------------------------------------------------

/**
 * Poll `docker compose ps --format json` for the service's health status.
 * Returns true when the service is "healthy", false on timeout.
 * @param {string} service
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<boolean>}
 */
async function pollServiceHealth(service, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runCapture('docker', ['compose', 'ps', '--format', 'json']);
    if (result.code === 0) {
      const text = result.stdout.trim();
      // docker compose ps --format json may emit one JSON object per line (NDJSON) or a JSON array
      const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const name = (obj.Name || obj.Service || '').toLowerCase();
          if (name.includes(service.toLowerCase())) {
            const health = (obj.Health || obj.Status || '').toLowerCase();
            console.log(`[health] ${service}: ${health}`);
            if (health === 'healthy') return true;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const printUsage = () => {
    console.error(
      'Usage: node scripts/ops/rollback-image.mjs --service <signalmap-api|signalmap-collector|signalmap-cron|signalmap-ui> --tag <docker-image-tag> [--dry-run]\n' +
      '\n' +
      'Examples:\n' +
      '  node scripts/ops/rollback-image.mjs --service signalmap-api --tag v1.2.3\n' +
      '  node scripts/ops/rollback-image.mjs --service signalmap-api --tag v1.2.3 --dry-run\n',
    );
  };

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Parse flags
  let service = '';
  let tag = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) {
      service = args[++i];
    } else if (args[i] === '--tag' && args[i + 1]) {
      tag = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else {
      console.error(`[error] Unknown argument: ${args[i]}`);
      printUsage();
      process.exit(1);
    }
  }

  if (!service) {
    console.error('[error] --service is required');
    printUsage();
    process.exit(1);
  }
  if (!VALID_SERVICES.includes(service)) {
    console.error(`[error] Unknown service "${service}". Valid services: ${VALID_SERVICES.join(', ')}`);
    process.exit(1);
  }
  if (!tag) {
    console.error('[error] --tag is required and must not be empty');
    printUsage();
    process.exit(1);
  }

  // Read compose to find the image name for this service
  const composePath = resolve(REPO_ROOT, 'docker-compose.yml');
  let composeText;
  try {
    composeText = readFileSync(composePath, 'utf8');
  } catch (err) {
    console.error(`[error] Cannot read docker-compose.yml at ${composePath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const imageBase = readImageForService(composeText, service);
  if (!imageBase) {
    console.error(`[error] Could not find image for service "${service}" in docker-compose.yml`);
    process.exit(1);
  }

  // The image in compose is e.g. "signalmap-node:latest" — strip the :tag part
  const imageName = imageBase.includes(':') ? imageBase.split(':')[0] : imageBase;
  const imageWithTag = `${imageName}:${tag}`;
  const imageLatest = `${imageName}:latest`;

  // Print plan
  console.log(`[plan] re-tag ${imageWithTag} -> ${imageLatest}, then docker compose up -d --no-build ${service}`);
  console.log(`[plan] Steps:`);
  console.log(`[plan]   1. docker pull ${imageWithTag}`);
  console.log(`[plan]   2. docker tag ${imageWithTag} ${imageLatest}`);
  console.log(`[plan]   3. docker compose up -d --no-build ${service}`);
  console.log(`[plan]   4. poll health for up to 60s`);

  if (dryRun) {
    console.log('[dry-run] Exiting without executing. Remove --dry-run to perform rollback.');
    process.exit(0);
  }

  // Step 1: docker pull
  console.log(`\n[step 1] Pulling ${imageWithTag}...`);
  const pullCode = await run('docker', ['pull', imageWithTag]);
  if (pullCode !== 0) {
    console.error(`[error] docker pull exited with code ${pullCode}`);
    process.exit(1);
  }

  // Step 2: docker tag
  console.log(`\n[step 2] Tagging ${imageWithTag} as ${imageLatest}...`);
  const tagCode = await run('docker', ['tag', imageWithTag, imageLatest]);
  if (tagCode !== 0) {
    console.error(`[error] docker tag exited with code ${tagCode}`);
    process.exit(1);
  }

  // Step 3: docker compose up
  console.log(`\n[step 3] Bringing ${service} up with --no-build...`);
  const upCode = await run('docker', ['compose', 'up', '-d', '--no-build', service]);
  if (upCode !== 0) {
    console.error(`[error] docker compose up exited with code ${upCode}`);
    process.exit(1);
  }

  // Step 4: poll health
  console.log(`\n[step 4] Polling ${service} health for up to 60s...`);
  const healthy = await pollServiceHealth(service, 60_000, 3_000);

  if (healthy) {
    console.log(`\n[ok] ${service} is healthy. Rollback to ${tag} complete.`);
    process.exit(0);
  } else {
    // Print final state regardless
    const result = await runCapture('docker', ['compose', 'ps']);
    console.log('\n[warn] Service did not reach healthy state within 60s. Final ps:');
    console.log(result.stdout);
    console.error(`[error] Rollback may have succeeded but service health check timed out.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

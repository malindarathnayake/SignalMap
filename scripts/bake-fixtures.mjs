// Bake the dev fixture responses into dist/api/ at build time.
// Lets a static-only Docker deployment serve a working demo (events,
// briefs, source health, bootstrap, per-event "Why this matters") via
// nginx without a Node backend. Run AFTER `vite build`.
//
// Usage: npx tsx scripts/bake-fixtures.mjs

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIST_EVENTS_FIXTURE,
  SOURCE_HEALTH_FIXTURE,
  BOOTSTRAP_FIXTURE,
  GLOBAL_BRIEF_FIXTURE,
  HEALTH_FIXTURE,
  buildEventBrief,
} from '../src/fixtures/signalmap.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const distApi = resolve(repoRoot, 'dist', 'api');

if (!existsSync(resolve(repoRoot, 'dist'))) {
  console.error('[bake-fixtures] dist/ not found — run `vite build` first.');
  process.exit(1);
}

function write(rel, body) {
  const full = resolve(distApi, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(body));
  return full.replace(repoRoot + '/', '').replace(/\\/g, '/');
}

const baked = [];
baked.push(write('signalmap/list.json', LIST_EVENTS_FIXTURE));
baked.push(write('signalmap/source-health.json', SOURCE_HEALTH_FIXTURE));
baked.push(write('bootstrap.json', BOOTSTRAP_FIXTURE));
baked.push(write('signalmap/brief/global.json', GLOBAL_BRIEF_FIXTURE));
baked.push(write('signalmap/health.json', HEALTH_FIXTURE));
baked.push(write('signalmap/brief/refresh.json', { ok: true }));
baked.push(write('signalmap/brief/health.json', {
  lastGeneratedAt: GLOBAL_BRIEF_FIXTURE.generatedAt,
  nextScheduledAt: GLOBAL_BRIEF_FIXTURE.generatedAt,
  dailySpendUsd: 0,
  dailyBudgetUsd: 2,
  modelInUse: GLOBAL_BRIEF_FIXTURE.model,
}));

for (const event of LIST_EVENTS_FIXTURE.events) {
  const brief = buildEventBrief(event, event.id);
  baked.push(write(`signalmap/brief/event/${event.id}.json`, brief));
}

console.log(`[bake-fixtures] wrote ${baked.length} files to dist/api/`);
for (const f of baked) console.log(`  ${f}`);

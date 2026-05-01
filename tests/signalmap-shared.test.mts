import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHROME_UA,
  loadSharedConfig,
  normalizeCountryToken,
  isIso2,
  isIso3,
  createCountryResolvers,
  resolveIso2,
  resolveCountryISO2,
} from '../scripts/_signalmap-shared.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('exports have correct types', () => {
  assert.equal(typeof CHROME_UA, 'string');
  assert.ok(CHROME_UA.length > 0);
  assert.equal(typeof loadSharedConfig, 'function');
  assert.equal(typeof normalizeCountryToken, 'function');
  assert.equal(typeof isIso2, 'function');
  assert.equal(typeof isIso3, 'function');
  assert.equal(typeof createCountryResolvers, 'function');
  assert.equal(typeof resolveIso2, 'function');
  assert.equal(typeof resolveCountryISO2, 'function');
});

test('loadSharedConfig returns country-names with united states=US', () => {
  const names = loadSharedConfig('country-names.json');
  assert.equal(typeof names, 'object');
  assert.equal(names['united states'], 'US');
});

test('resolveCountryISO2 resolves United States to US', () => {
  assert.equal(resolveCountryISO2('United States'), 'US');
});

test('JSON config files exist and parse with non-empty content', () => {
  const files = [
    'country-bboxes.json',
    'country-names.json',
    'iso3-to-iso2.json',
    'source-tiers.json',
  ];
  for (const file of files) {
    const p = join(repoRoot, 'scripts', 'shared', file);
    assert.ok(existsSync(p), `Missing: ${p}`);
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    assert.ok(Object.keys(parsed).length > 0, `Empty: ${p}`);
  }
});

test('top-level shared/country-names.json exists and parses with non-empty content', () => {
  const p = join(repoRoot, 'shared', 'country-names.json');
  assert.ok(existsSync(p), `Missing: ${p}`);
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(Object.keys(parsed).length > 0, `Empty: ${p}`);
});

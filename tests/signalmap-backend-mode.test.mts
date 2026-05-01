import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  shouldEnableSignalmapFixtures,
  isLiveMode,
} from '../scripts/_signalmap-backend-mode.mjs';

test('shouldEnableSignalmapFixtures: live mode disables', () => {
  assert.equal(shouldEnableSignalmapFixtures({ SIGNALMAP_BACKEND_MODE: 'live' }), false);
});

test('shouldEnableSignalmapFixtures: fixture mode enables regardless of NODE_ENV', () => {
  assert.equal(shouldEnableSignalmapFixtures({ SIGNALMAP_BACKEND_MODE: 'fixture', NODE_ENV: 'production' }), true);
  assert.equal(shouldEnableSignalmapFixtures({ SIGNALMAP_BACKEND_MODE: 'fixture' }), true);
});

test('shouldEnableSignalmapFixtures: unset mode falls back to NODE_ENV', () => {
  assert.equal(shouldEnableSignalmapFixtures({ NODE_ENV: 'development' }), true);
  assert.equal(shouldEnableSignalmapFixtures({ NODE_ENV: 'production' }), false);
  assert.equal(shouldEnableSignalmapFixtures({}), false);
});

test('isLiveMode: only "live" returns true', () => {
  assert.equal(isLiveMode({ SIGNALMAP_BACKEND_MODE: 'live' }), true);
  assert.equal(isLiveMode({ SIGNALMAP_BACKEND_MODE: 'fixture' }), false);
  assert.equal(isLiveMode({ SIGNALMAP_BACKEND_MODE: 'LIVE' }), false); // case-sensitive
  assert.equal(isLiveMode({}), false);
});

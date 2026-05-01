#!/usr/bin/env node
/**
 * validate-jsonl.mjs — Cross-platform JSONL log validator.
 *
 * Usage: node scripts/validate-jsonl.mjs <log-path>
 *
 * Replaces `head -1 | jq` for cross-platform JSONL conformance checking.
 * Gate: every non-empty line must be valid JSON with ts, level, service, event.
 *
 * Exit codes:
 *   0 — all lines valid (or file is empty)
 *   1 — one or more invalid lines
 *   2 — usage error or file cannot be read
 */

import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

const REQUIRED_KEYS = ['ts', 'level', 'service', 'event'];
const VALID_LEVELS = new Set(['info', 'warn', 'error']);

const filePath = argv[2];

if (!filePath) {
  stderr.write('usage: node scripts/validate-jsonl.mjs <log-path>\n');
  exit(2);
}

let raw;
try {
  raw = readFileSync(filePath, 'utf8');
} catch (err) {
  stderr.write(`error: cannot read ${filePath}: ${err.message}\n`);
  exit(2);
}

const lines = raw.split('\n');

let linesValidated = 0;
let linesInvalid = 0;
const errors = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Skip empty / whitespace-only lines (includes trailing newline element).
  if (line.trim() === '') continue;

  const lineNum = i + 1;
  let obj;

  // Rule 1: must parse as JSON.
  try {
    obj = JSON.parse(line);
  } catch (err) {
    linesInvalid++;
    errors.push({ lineNum, reason: `JSON parse failed: ${err.message}` });
    continue;
  }

  // Rule 2: must be a plain object (not array, null, or primitive).
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    linesInvalid++;
    errors.push({ lineNum, reason: 'value is not a JSON object' });
    continue;
  }

  // Rule 3: must contain all required keys.
  const missing = REQUIRED_KEYS.filter((k) => !(k in obj));
  if (missing.length > 0) {
    linesInvalid++;
    errors.push({ lineNum, reason: `missing required field(s): ${missing.join(', ')}` });
    continue;
  }

  // Rule 4: ts must be a string and parse as a valid Date.
  if (typeof obj.ts !== 'string' || isNaN(new Date(obj.ts).getTime())) {
    linesInvalid++;
    errors.push({ lineNum, reason: `ts must be a valid ISO date string, got: ${JSON.stringify(obj.ts)}` });
    continue;
  }

  // Rule 5: level must be one of the allowed values.
  if (!VALID_LEVELS.has(obj.level)) {
    linesInvalid++;
    errors.push({ lineNum, reason: `level must be info|warn|error, got: ${JSON.stringify(obj.level)}` });
    continue;
  }

  // Rule 6: service must be a non-empty string.
  if (typeof obj.service !== 'string' || obj.service.trim() === '') {
    linesInvalid++;
    errors.push({ lineNum, reason: `service must be a non-empty string, got: ${JSON.stringify(obj.service)}` });
    continue;
  }

  // Rule 7: event must be a non-empty string.
  if (typeof obj.event !== 'string' || obj.event.trim() === '') {
    linesInvalid++;
    errors.push({ lineNum, reason: `event must be a non-empty string, got: ${JSON.stringify(obj.event)}` });
    continue;
  }

  linesValidated++;
}

const totalLines = linesValidated + linesInvalid;

if (linesInvalid === 0) {
  stdout.write(`validated ${linesValidated} JSON line(s)\n`);
  exit(0);
} else {
  const shown = errors.slice(0, 5);
  for (const e of shown) {
    stderr.write(`line ${e.lineNum}: ${e.reason}\n`);
  }
  stderr.write(`${linesInvalid}/${totalLines} invalid line(s)\n`);
  exit(1);
}

#!/usr/bin/env node
// Verify Perplexity Sonar Pro response shape matches expectations from
// docs/SignalMap/spec.md §Brief Backend.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/verify-perplexity-shape.mjs <path-to-raw-json>');
  process.exit(2);
}

const raw = readFileSync(path, 'utf8');
const r = JSON.parse(raw);

const failures = [];
const required = ['id', 'model', 'choices', 'usage'];
for (const k of required) {
  if (!(k in r)) failures.push(`missing top-level key: ${k}`);
}

const choices = r.choices;
if (!Array.isArray(choices) || choices.length === 0) {
  failures.push('choices is not a non-empty array');
} else {
  const c0 = choices[0];
  if (!c0?.message?.content || typeof c0.message.content !== 'string') {
    failures.push('choices[0].message.content missing or not a string');
  }
}

if (r.usage) {
  for (const k of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (typeof r.usage[k] !== 'number') failures.push(`usage.${k} missing or not a number`);
  }
} else {
  failures.push('usage object missing');
}

// Citations may be at top level or in choices[0].citations — accept either, but require one.
const cites = r.citations ?? r.choices?.[0]?.citations ?? null;
if (!Array.isArray(cites)) {
  failures.push('citations array not found at top level or choices[0].citations');
}

if (failures.length) {
  console.error('FAIL — Perplexity shape mismatch:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log('PASS — Perplexity Sonar Pro shape verified.');
console.log(`  model: ${r.model}`);
console.log(`  choices[0].message.content: ${r.choices[0].message.content.length} chars`);
console.log(`  usage: prompt=${r.usage.prompt_tokens} completion=${r.usage.completion_tokens} total=${r.usage.total_tokens}`);
console.log(`  citations: ${cites.length} entries`);
process.exit(0);

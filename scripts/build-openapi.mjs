/**
 * build-openapi.mjs
 *
 * Calls generateSpec() from the server OpenAPI module and writes
 * the result as YAML to public/openapi.yaml.
 *
 * Run via:  tsx scripts/build-openapi.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { generateSpec } from '../server/api/openapi.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outPath = resolve(repoRoot, 'public', 'openapi.yaml');

// Ensure public/ exists
mkdirSync(resolve(repoRoot, 'public'), { recursive: true });

const spec = generateSpec();

// Stringify with nullEncoding and forceQuotes for numeric-looking keys (e.g. "5XX")
const yamlText = stringify(spec, {
  defaultStringType: 'QUOTE_DOUBLE',
  defaultKeyType: 'PLAIN',
  nullStr: 'null',
});

writeFileSync(outPath, yamlText, 'utf8');
console.log(`Wrote ${Buffer.byteLength(yamlText, 'utf8')} bytes to public/openapi.yaml`);

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// SignalMap source surface — must mirror `tsconfig.json` `include` after
// Phase 7a narrowing. If a new path is added to tsconfig include, add it
// here too (and vice versa). The test is intentionally scoped; legacy
// archive-bound files (src/App.ts, src/app/*, src/components/*.ts panels)
// still reference SITE_VARIANT and will be removed in Phase 9 git rm.
const SIGNALMAP_SURFACE = [
  'src/main.tsx',
  'src/app.tsx',
  'src/state',
  'src/components/chrome',
  'src/components/feed',
  'src/components/inspector',
  'src/components/rail',
  'src/components/map',
  'src/server',
  'src/client',
  'src/fixtures',
  'src/types',
  'src/vite-env.d.ts',
];

const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx)$/;

function collectFiles(relPath) {
  const abs = resolve(repoRoot, relPath);
  if (!existsSync(abs)) return [];
  const stat = statSync(abs);
  if (stat.isFile()) return SOURCE_EXT.test(abs) ? [abs] : [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const child = join(abs, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(child.slice(repoRoot.length + 1)));
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
}

const allFiles = SIGNALMAP_SURFACE.flatMap(collectFiles);

describe('no variant imports — SignalMap surface', () => {
  it('scans a non-trivial set of SignalMap source files', () => {
    assert.ok(
      allFiles.length >= 15,
      `Expected at least 15 SignalMap source files in scope, got ${allFiles.length}. The SIGNALMAP_SURFACE enumeration may be stale.`,
    );
  });

  it('no source file references SITE_VARIANT', () => {
    const offenders = allFiles.filter((f) => /\bSITE_VARIANT\b/.test(readFileSync(f, 'utf-8')));
    assert.deepEqual(
      offenders,
      [],
      `SITE_VARIANT references found in SignalMap surface (variant system was deleted in Phase 7a):\n  ${offenders.join('\n  ')}`,
    );
  });

  it('no source file references VITE_VARIANT', () => {
    const offenders = allFiles.filter((f) => /\bVITE_VARIANT\b/.test(readFileSync(f, 'utf-8')));
    assert.deepEqual(
      offenders,
      [],
      `VITE_VARIANT references found in SignalMap surface (build-time variant env removed in Phase 7b):\n  ${offenders.join('\n  ')}`,
    );
  });

  it('no source file imports from @/config/variant or relative variant module', () => {
    // Matches: from '@/config/variant', from '@/config/variant-meta',
    // from '@/config/variants/foo', from '../config/variant', from './variant', etc.
    const re = /from\s+['"][^'"]*\/config\/variant(?:-meta|\/[^'"]*|)['"]/;
    const offenders = allFiles.filter((f) => re.test(readFileSync(f, 'utf-8')));
    assert.deepEqual(
      offenders,
      [],
      `config/variant imports found in SignalMap surface (variant.ts was deleted in Phase 7a):\n  ${offenders.join('\n  ')}`,
    );
  });
});

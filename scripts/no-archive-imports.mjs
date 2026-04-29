import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts']);

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.cache']);

// Regex captures the specifier in: import/export ... from 'X', import('X'), require('X')
const IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]\s*\)?/g;

function parseArgs(argv) {
  const args = argv.slice(2);
  let branch = process.env.ARCHIVE_BRANCH || 'archive/v1-legacy';

  for (const arg of args) {
    if (arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
      if (!branch) {
        process.stderr.write('no-archive-imports: --branch= requires a value\n');
        process.stderr.write('Usage: node scripts/no-archive-imports.mjs [--branch=<name>]\n');
        process.exit(2);
      }
    } else {
      process.stderr.write(`no-archive-imports: unknown flag: ${arg}\n`);
      process.stderr.write('Usage: node scripts/no-archive-imports.mjs [--branch=<name>]\n');
      process.exit(2);
    }
  }

  return { branch };
}

function getArchivedFiles(branch) {
  const result = spawnSync('git', ['ls-tree', '-r', '--name-only', branch], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    process.stderr.write(
      `no-archive-imports: failed to list files from branch "${branch}".\n` +
      `  git exited with code ${result.status}.\n` +
      (stderr ? `  git stderr: ${stderr}\n` : '') +
      `  If the branch does not exist locally, run:\n` +
      `    git fetch origin ${branch}:${branch}\n` +
      `  or create it locally.\n`
    );
    process.exit(2);
  }

  return result.stdout.split('\n').filter(Boolean);
}

function buildMatchMap(archivedFiles) {
  // Map<matchString, archivedPath>
  const map = new Map();

  for (const p of archivedFiles) {
    if (!SOURCE_EXTENSIONS.has(extname(p))) continue;

    const withoutExt = p.replace(/\.[^./]+$/, '');

    map.set(p, p);
    map.set(withoutExt, p);

    if (p.startsWith('src/')) {
      const aliasWithoutExt = '@/' + withoutExt.slice('src/'.length);
      map.set(aliasWithoutExt, p);
    }
  }

  return map;
}

function* walkDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      yield fullPath;
    }
  }
}

function scanFile(filePath, matchMap, repoRoot) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const relPath = relative(repoRoot, filePath).replace(/\\/g, '/');
  const offenders = [];

  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const specifier = match[1];
    if (matchMap.has(specifier)) {
      const matchOffset = match.index;
      const lineNumber = content.slice(0, matchOffset).split('\n').length;
      offenders.push({
        importer: relPath,
        lineNumber,
        specifier,
        archivedPath: matchMap.get(specifier),
      });
    }
  }

  return offenders;
}

function main() {
  const { branch } = parseArgs(process.argv);

  const scriptUrl = import.meta.url;
  const scriptPath = fileURLToPath(scriptUrl);
  // repo root is two levels up from scripts/no-archive-imports.mjs
  const repoRoot = join(scriptPath, '..', '..').replace(/\\/g, '/');

  const archivedFiles = getArchivedFiles(branch);
  const matchMap = buildMatchMap(archivedFiles);

  const scanRoots = [join(repoRoot, 'src'), join(repoRoot, 'server')];

  const allOffenders = [];
  let scannedCount = 0;

  for (const root of scanRoots) {
    let exists = false;
    try {
      statSync(root);
      exists = true;
    } catch {
      // directory doesn't exist, skip
    }
    if (!exists) continue;

    for (const filePath of walkDir(root)) {
      scannedCount++;
      const found = scanFile(filePath, matchMap, repoRoot);
      allOffenders.push(...found);
    }
  }

  // Sort by importer then lineNumber
  allOffenders.sort((a, b) => {
    if (a.importer < b.importer) return -1;
    if (a.importer > b.importer) return 1;
    return a.lineNumber - b.lineNumber;
  });

  if (allOffenders.length === 0) {
    process.stdout.write(
      `no-archive-imports: OK (scanned ${scannedCount} files against ${matchMap.size} archived paths)\n`
    );
    process.exit(0);
  } else {
    process.stderr.write(
      `no-archive-imports: FAIL — ${allOffenders.length} offending import(s)\n`
    );
    for (const o of allOffenders) {
      process.stderr.write(
        `  ${o.importer}:${o.lineNumber}: imports '${o.specifier}' which lives in archive at ${o.archivedPath}\n`
      );
    }
    process.exit(1);
  }
}

main();

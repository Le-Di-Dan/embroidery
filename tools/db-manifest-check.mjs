#!/usr/bin/env node
/**
 * Static validation of the DB6 manifests (DB6-C0 §7).
 *
 * Checks that can be made without a database:
 *   1. every TBL-001..078 appears exactly once in the schema manifest;
 *   2. every IDX-* in the index manifest has exactly one status;
 *   3. retired IDX IDs are not reused;
 *   4. constraint-owned indexes are not also listed as explicit;
 *   5. schema source files referenced by implemented rows exist on disk;
 *   6. every schema file on disk is referenced by the manifest;
 *   7. every table exported from the schema entrypoint is in the manifest.
 *
 * Object-level parity against a live database is a separate gate
 * (`pnpm db:status` plus the fresh-install report).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(REPO_ROOT, 'docs', 'database');
const SCHEMA_DIR = join(REPO_ROOT, 'packages', 'database', 'src', 'schema');

const SCHEMA_MANIFEST = join(DOCS, 'DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md');
const INDEX_MANIFEST = join(DOCS, 'DB6_INDEX_IMPLEMENTATION_MANIFEST.md');

const TOTAL_TABLES = 78;
const RETIRED_IDX = ['IDX-072', 'IDX-083', 'IDX-089', 'IDX-128'];

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`missing manifest: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

/**
 * Markdown emphasis is presentational, but it hides rows from a naive row
 * regex — `| **IDX-024** |` would not match `| IDX-024 |` and the row would be
 * silently skipped. Strip emphasis before any structural matching.
 */
function stripEmphasis(markdown) {
  return markdown.replaceAll('**', '');
}

const schemaManifest = stripEmphasis(read(SCHEMA_MANIFEST));
const indexManifest = stripEmphasis(read(INDEX_MANIFEST));

// --- 1. TBL coverage: each of TBL-001..078 in exactly one table row --------
{
  const rows = schemaManifest.split('\n').filter((l) => /^\| TBL-\d{3} \|/.test(l));
  const counts = new Map();
  for (const row of rows) {
    const id = row.match(/TBL-\d{3}/)[0];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (let i = 1; i <= TOTAL_TABLES; i += 1) {
    const id = `TBL-${String(i).padStart(3, '0')}`;
    const n = counts.get(id) ?? 0;
    if (n === 0) fail(`${id} is not in the schema manifest table register`);
    if (n > 1) fail(`${id} appears ${n} times in the schema manifest (must be exactly one group)`);
  }
  notes.push(`schema manifest: ${rows.length} table rows for ${TOTAL_TABLES} tables`);
}

// --- 2/3. IDX status uniqueness and retired-ID reuse -----------------------
{
  const statusRows = indexManifest.split('\n').filter((l) => /^\| IDX-\d{3} \|/.test(l));
  const seen = new Map();
  for (const row of statusRows) {
    const id = row.match(/IDX-\d{3}/)[0];
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, n] of seen) {
    if (n > 1) fail(`${id} has ${n} rows in the index manifest register (must be one)`);
  }
  for (const retired of RETIRED_IDX) {
    if (seen.has(retired)) {
      fail(`${retired} is retired by DB5 and must not be reused, but appears as a register row`);
    }
  }
  notes.push(
    `index manifest: ${seen.size} IDX register rows, ${RETIRED_IDX.length} retired IDs not reused`,
  );
}

// --- 4. constraint-owned indexes must not also be explicit -----------------
{
  const block = indexManifest.match(/### 2\.3[\s\S]*?```text\n([\s\S]*?)```/);
  const constraintOwned = block ? (block[1].match(/IDX-\d{3}|\b\d{3}\b/g) ?? []) : [];
  const owned = new Set(constraintOwned.map((t) => (t.startsWith('IDX-') ? t : `IDX-${t}`)));
  const explicitPartial = new Set(
    indexManifest.match(/### 2\.2[\s\S]*?(?=### 2\.3)/)?.[0].match(/IDX-\d{3}/g) ?? [],
  );
  for (const id of explicitPartial) {
    if (owned.has(id)) {
      fail(
        `${id} is listed both as constraint-owned (§2.3) and as an explicit partial unique (§2.2)`,
      );
    }
  }
  notes.push(
    `ownership: ${owned.size} constraint-owned, ${explicitPartial.size} explicit partial unique, no overlap`,
  );
}

// --- 5/6/7. schema files on disk vs manifest vs entrypoint -----------------
{
  const referenced = new Set(
    (schemaManifest.match(/`([a-z-]+\/[a-z0-9-]+\.ts)`/g) ?? []).map((m) => m.replaceAll('`', '')),
  );

  const onDisk = [];
  if (existsSync(SCHEMA_DIR)) {
    for (const context of readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
      if (!context.isDirectory()) continue;
      for (const file of readdirSync(join(SCHEMA_DIR, context.name))) {
        if (file.endsWith('.ts')) onDisk.push(`${context.name}/${file}`);
      }
    }
  }

  for (const file of onDisk) {
    if (!referenced.has(file)) {
      fail(`schema file ${file} exists on disk but is not referenced by the schema manifest`);
    }
  }

  // implemented rows must point at a file that exists
  for (const row of schemaManifest.split('\n')) {
    // Emphasis was already stripped, so the status reads as a bare word.
    if (!/^\| TBL-\d{3} \|/.test(row) || !row.includes('implemented')) continue;
    const file = row.match(/`([a-z-]+\/[a-z0-9-]+\.ts)`/)?.[1];
    if (file === undefined) {
      fail(`implemented row has no schema file reference: ${row.slice(0, 60)}`);
    } else if (!existsSync(join(SCHEMA_DIR, file))) {
      fail(`implemented row references missing file: ${file}`);
    }
  }

  const entrypoint = join(SCHEMA_DIR, 'index.ts');
  if (existsSync(entrypoint)) {
    const exported = (
      readFileSync(entrypoint, 'utf8').match(/from '\.\/([a-z-]+\/[a-z0-9-]+)'/g) ?? []
    ).map((m) => `${m.match(/\.\/([a-z-]+\/[a-z0-9-]+)/)[1]}.ts`);
    for (const file of exported) {
      if (!referenced.has(file)) {
        fail(`${file} is exported from schema/index.ts but not referenced by the manifest`);
      }
    }
    for (const file of onDisk) {
      if (file !== 'index.ts' && !exported.includes(file)) {
        fail(
          `${file} exists but is not exported from schema/index.ts (invisible to migration generation)`,
        );
      }
    }
    notes.push(
      `schema: ${onDisk.length} files on disk, ${exported.length} exported, all manifest-referenced`,
    );
  }
}

for (const note of notes) console.log(`[manifest] ${note}`);
if (problems.length > 0) {
  console.error(`\n[manifest] ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\n[manifest] all checks passed');
}

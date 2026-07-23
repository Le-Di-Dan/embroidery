#!/usr/bin/env node
/**
 * Fails if the built API production artifact (`apps/api/dist`) contains any
 * test-only integration-harness code (APP0-T01-C1). Test support and specs live
 * under `apps/api/test/**` (outside the compiled `src/`), so a clean production
 * build must never emit them. This guards the boundary against regressions such
 * as a stray `include`, a spec left under `src`, or a test import pulled into a
 * production module.
 *
 * Usage:
 *   pnpm --filter @embroidery/api build
 *   node tools/check-api-dist-boundary.mjs
 *
 * Exit code 0 = clean; 1 = test code found; 2 = dist missing (build first).
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'apps', 'api', 'dist');

// Path fragments and content markers that must never appear in a production build.
const FORBIDDEN_PATH_FRAGMENTS = [
  'api-integration-context',
  'recording-log-sink',
  '.spec.',
  `${path.sep}tests${path.sep}`,
  `${path.sep}test${path.sep}integration${path.sep}`,
  `${path.sep}test${path.sep}support${path.sep}`,
];
const FORBIDDEN_CONTENT_MARKERS = [
  'api-integration-context',
  'recording-log-sink',
  'createApiIntegrationContext',
  'supertest',
  't01-', // T01 disposable database labels
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function main() {
  if (!existsSync(distDir)) {
    console.error(`[api-dist-boundary] ${distDir} not found. Build the API first:`);
    console.error('  pnpm --filter @embroidery/api build');
    process.exitCode = 2;
    return;
  }

  const files = await listFiles(distDir);
  const violations = [];

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const relLower = rel.toLowerCase();
    for (const fragment of FORBIDDEN_PATH_FRAGMENTS) {
      if (relLower.includes(fragment.toLowerCase())) {
        violations.push(`${rel} — forbidden path fragment "${fragment.trim()}"`);
      }
    }
    if (/\.(js|d\.ts|map)$/.test(file)) {
      const content = await readFile(file, 'utf8');
      for (const marker of FORBIDDEN_CONTENT_MARKERS) {
        if (content.includes(marker)) {
          violations.push(`${rel} — forbidden content marker "${marker}"`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('[api-dist-boundary] test-only integration code found in the production build:');
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[api-dist-boundary] clean: ${files.length} built file(s), no test integration code.`,
  );
}

await main();

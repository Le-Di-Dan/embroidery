#!/usr/bin/env node
// Production build boundary gate (APP0-T02A). After a real `next build`, scans
// each app's `.next` output for any trace of test code / test-only support, so
// a green build is not mistaken for a clean production artifact. Cross-platform,
// dependency-free. Exit 1 on any marker hit, exit 2 if an app has not been built.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APPS = ['apps/admin', 'apps/storefront'];

// Path fragments that must never appear in a production bundle, and content
// markers that would only be present if test code leaked in.
const PATH_MARKERS = ['/test/', 'jest.setup', 'jest.config', '.test.', '.spec.'];
const CONTENT_MARKERS = [
  '@embroidery/frontend-testing',
  'renderWithProviders',
  'createNavigationMock',
  '@testing-library',
  'SampleWidget',
  'HealthStatus',
  'sample-widget',
];
// Scan compiled server/client output; skip the local build cache (SWC artifacts,
// not shipped) to avoid false positives from incremental compiler metadata.
const SCAN_EXT = /\.(js|cjs|mjs|json|html)$/;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'cache') continue;
      files.push(...walk(join(dir, entry.name)));
    } else {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const violations = [];
let scanned = 0;

for (const app of APPS) {
  const nextDir = join(ROOT, app, '.next');
  try {
    statSync(nextDir);
  } catch {
    console.error(`[frontend-build-boundary] ${app}/.next not found — run \`next build\` first.`);
    process.exit(2);
  }

  for (const file of walk(nextDir)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');

    // The test-only package must never be traced into the shipped bundle as code.
    if (rel.includes('node_modules/@embroidery/frontend-testing')) {
      violations.push(
        `${rel}: test-only @embroidery/frontend-testing traced into production output`,
      );
      continue;
    }
    const marker = PATH_MARKERS.find((m) => rel.includes(m));
    if (marker) {
      violations.push(`${rel}: production output path contains test marker "${marker}"`);
      continue;
    }
    if (!SCAN_EXT.test(file)) continue;

    // A copied package.json manifest legitimately lists devDependency *names*
    // (metadata, not code). Skip its content scan; the node_modules trace check
    // above already proves the package's code is not shipped.
    if (file.endsWith('package.json')) continue;

    scanned += 1;
    const text = readFileSync(file, 'utf8');
    for (const m of CONTENT_MARKERS) {
      if (text.includes(m)) {
        violations.push(`${rel}: production output contains test marker "${m}"`);
        break;
      }
    }
  }
}

if (violations.length > 0) {
  console.error('[frontend-build-boundary] violations:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(
  `[frontend-build-boundary] clean: scanned ${scanned} built file(s), no test code in .next output.`,
);

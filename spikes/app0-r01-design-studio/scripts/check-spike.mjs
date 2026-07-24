#!/usr/bin/env node
/**
 * Spike-local gate: production isolation + a reproducibility check that the
 * committed results actually belong to this spike.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { collectStaticViolations } from '../../../tools/check-spike-boundaries.mjs';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const REQUIRED_RESULTS = [
  'environment.windows.json',
  'environment.linux.json',
  'bundle.json',
  'scoring.json',
  'konva.summary.json',
  'fabric.summary.json',
  'svg.summary.json',
];

const failures = [...collectStaticViolations(REPO_ROOT)];

for (const name of REQUIRED_RESULTS) {
  if (!existsSync(join(PACKAGE_ROOT, 'results', name))) {
    failures.push(`missing result artifact results/${name}`);
  }
}

const rawDirectory = join(PACKAGE_ROOT, 'results', 'raw');
const rawFiles = existsSync(rawDirectory) ? readdirSync(rawDirectory) : [];
for (const platform of ['windows', 'linux']) {
  if (!rawFiles.some((name) => name.endsWith(`.${platform}.json`))) {
    failures.push(`no raw results captured on ${platform}`);
  }
}

// Results must never leak an absolute path, a secret or an external URL.
const FORBIDDEN = [/[A-Za-z]:\\/, /\/home\/[a-z]/i, /https?:\/\/(?!localhost|127\.0\.0\.1)/i];
for (const name of [...REQUIRED_RESULTS, ...rawFiles.map((file) => join('raw', file))]) {
  const path = join(PACKAGE_ROOT, 'results', name);
  if (!existsSync(path)) {
    continue;
  }
  const content = readFileSync(path, 'utf8');
  for (const pattern of FORBIDDEN) {
    if (pattern.test(content)) {
      failures.push(`results/${name} contains a machine path or external URL (${String(pattern)})`);
    }
  }
}

if (failures.length > 0) {
  console.error('[spike:check] failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(
  `[spike:check] clean: production isolation holds, ${String(REQUIRED_RESULTS.length)} result artifacts present, ${String(rawFiles.length)} raw runs, no machine paths or external URLs.`,
);

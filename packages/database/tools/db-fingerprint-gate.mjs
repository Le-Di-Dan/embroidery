/**
 * DB6-S27 — CI fingerprint gate.
 * Generates the live schema fingerprint and compares it against the full
 * canonical hash committed in `canonical-fingerprint.txt` (never only a
 * prefix). A mismatch fails deterministically — this script never updates
 * the canonical file itself; that requires a reviewed, explicit edit tied to
 * an actual schema change.
 * Usage: node db-fingerprint-gate.mjs <url> [expected-file]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { redactUrl } from './live-db.mjs';

const url = process.argv[2];
const expectedFile = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), 'canonical-fingerprint.txt');

if (!url) {
  console.error('[fingerprint-gate] usage: node db-fingerprint-gate.mjs <url> [expected-file]');
  process.exit(2);
}

let expected;
try {
  expected = readFileSync(expectedFile, 'utf8').trim();
} catch {
  console.error(`[fingerprint-gate] could not read canonical fingerprint file: ${expectedFile}`);
  process.exit(2);
}

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'db-schema-fingerprint.mjs');
let actual;
try {
  actual = execFileSync('node', [scriptPath, url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch (err) {
  console.error(`[fingerprint-gate] failed to generate live fingerprint for ${redactUrl(url)}`);
  console.error(`[fingerprint-gate] ${(err.stderr ?? '').toString().trim().split('\n').pop()}`);
  process.exit(2);
}

if (actual !== expected) {
  console.error('[fingerprint-gate] MISMATCH — live schema fingerprint differs from the canonical baseline');
  console.error(`[fingerprint-gate] expected: ${expected}`);
  console.error(`[fingerprint-gate] actual:   ${actual}`);
  console.error('[fingerprint-gate] this means an object changed since the baseline was set — identify the exact');
  console.error('[fingerprint-gate] table/constraint/index/function/trigger, do not update this file to force a pass.');
  process.exit(1);
}

console.log(`[fingerprint-gate] match — ${actual}`);

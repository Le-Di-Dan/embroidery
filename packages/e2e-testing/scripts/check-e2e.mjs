#!/usr/bin/env node
/**
 * Browser-free E2E validation for the fast quality chain (`check:e2e`).
 *
 * 1. Static boundary: no E2E spec/support under any app/API production `src`;
 *    no production source imports `@embroidery/e2e-testing`; the package is not
 *    an app runtime dependency.
 * 2. Config/spec integrity: `playwright test --list` collects every project and
 *    spec WITHOUT launching a browser.
 *
 * Never starts services, browsers, or databases. Exit 1 on any violation.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { PACKAGE_ROOT, REPO_ROOT } from '../support/orchestration/config.mjs';
import { collectStaticViolations } from '../../../tools/check-e2e-boundaries.mjs';

function fail(message) {
  process.stderr.write(`[check:e2e] ${message}\n`);
  process.exitCode = 1;
}

// 1. Static boundary.
const violations = collectStaticViolations(REPO_ROOT);
if (violations.length > 0) {
  for (const v of violations) {
    fail(`boundary: ${v}`);
  }
} else {
  process.stdout.write(
    '[check:e2e] boundary clean: no E2E code under app/API src; devDependency-only.\n',
  );
}

// 2. Config + spec collection (no browser).
const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
let cli;
for (const id of ['@playwright/test/cli', '@playwright/test/cli.js', 'playwright/cli']) {
  try {
    cli = require.resolve(id);
    break;
  } catch {
    // try next
  }
}
if (!cli) {
  fail('could not resolve the Playwright CLI (is @playwright/test installed?)');
  process.exit(process.exitCode ?? 1);
}

const listed = spawnSync(process.execPath, [cli, 'test', '--list'], {
  cwd: PACKAGE_ROOT,
  encoding: 'utf8',
});
if (listed.status !== 0) {
  fail(`playwright --list failed:\n${(listed.stdout ?? '') + (listed.stderr ?? '')}`);
} else {
  const total = listed.stdout.match(/Total: (\d+) test/)?.[1] ?? 'some';
  process.stdout.write(
    `[check:e2e] config + specs collect cleanly (${total} tests across projects).\n`,
  );
}

// Confirm the package manifest pins the exact Playwright version.
const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const pinned = pkg.devDependencies?.['@playwright/test'];
if (pinned !== '1.61.1') {
  fail(`@playwright/test must be pinned to exactly 1.61.1 (found "${pinned}").`);
} else {
  process.stdout.write('[check:e2e] @playwright/test pinned to 1.61.1.\n');
}

process.exit(process.exitCode ?? 0);

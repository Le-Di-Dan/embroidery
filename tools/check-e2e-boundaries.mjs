#!/usr/bin/env node
// E2E boundary gate (APP0-T02B). Two layers:
//   static:  no E2E spec/support under any app/API production `src`; no
//            production source imports `@embroidery/e2e-testing`; the package is
//            never an app runtime dependency.
//   build:   after builds, no E2E marker (@playwright/test, e2e-testing,
//            playwright.config, test-results, playwright-report) is bundled into
//            any app `.next` or the API `dist` (package.json manifests, which may
//            list a devDependency name as metadata, are exempt from content scan).
// Cross-platform, dependency-free. Usable as a module (collectStaticViolations,
// collectBuildViolations) or a CLI (runs static always, build when outputs exist).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_PACKAGE = '@embroidery/e2e-testing';
const SRC_ROOTS = ['apps/admin/src', 'apps/storefront/src', 'apps/api/src'];
const BUILD_TARGETS = ['apps/admin/.next', 'apps/storefront/.next', 'apps/api/dist'];
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const CONTENT_MARKERS = ['@playwright/test', TEST_PACKAGE, 'playwright.config'];
const PATH_MARKERS = ['e2e-testing', 'playwright-report', 'test-results'];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'cache') continue;
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

export function collectStaticViolations(root) {
  const violations = [];

  for (const srcRel of SRC_ROOTS) {
    for (const file of walk(join(root, srcRel))) {
      if (!CODE_FILE.test(file)) continue;
      const rel = relative(root, file).replace(/\\/g, '/');
      if (
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) &&
        /playwright/i.test(readFileSync(file, 'utf8'))
      ) {
        violations.push(`${rel}: Playwright spec under production src`);
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (text.includes(TEST_PACKAGE) || text.includes('@playwright/test')) {
        violations.push(`${rel}: production src references the E2E tier`);
      }
    }
  }

  for (const app of ['apps/admin', 'apps/storefront', 'apps/api', 'apps/worker']) {
    const manifestPath = join(root, app, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const field of ['dependencies', 'devDependencies']) {
      if (pkg[field] && Object.hasOwn(pkg[field], TEST_PACKAGE)) {
        violations.push(`${app}/package.json: must not depend on ${TEST_PACKAGE} (${field})`);
      }
    }
  }

  return violations;
}

export function collectBuildViolations(root) {
  const violations = [];
  let scanned = 0;
  for (const target of BUILD_TARGETS) {
    const dir = join(root, target);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      scanned += 1;
      const rel = relative(root, file).replace(/\\/g, '/');
      if (PATH_MARKERS.some((m) => rel.includes(m))) {
        violations.push(`${rel}: E2E artifact path in build output`);
        continue;
      }
      if (file.endsWith('package.json')) continue; // manifest metadata, not bundled code
      if (!CODE_FILE.test(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const marker of CONTENT_MARKERS) {
        if (text.includes(marker)) {
          violations.push(`${rel}: contains E2E marker "${marker}"`);
          break;
        }
      }
    }
  }
  return { violations, scanned };
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMain()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const staticViolations = collectStaticViolations(root);
  const build = collectBuildViolations(root);
  const all = [...staticViolations, ...build.violations];
  if (all.length > 0) {
    console.error('[e2e-boundary] violations:');
    for (const v of all) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `[e2e-boundary] clean: static + ${build.scanned} built file(s) scanned, no E2E code in app/API output.`,
  );
}

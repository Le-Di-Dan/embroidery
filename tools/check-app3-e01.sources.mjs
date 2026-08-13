/**
 * `APP3-E01` — the files the gate reads, and how it reads them.
 *
 * Shared with the mutation tests so a case can replace exactly one file in a
 * throwaway copy of the repository and prove the rule that protects it fails.
 *
 * Read-only, cross-platform pure Node: no database, no container, no network.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const STOREFRONT = 'apps/storefront';
export const FEATURE = `${STOREFRONT}/src/features/design-studio`;

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  generatedClient: 'packages/api-client/src/generated/embroidery-api.ts',
  rootPackage: 'package.json',
  // The production seam `APP3-E01` repaired.
  networkKey:
    'apps/api/src/modules/design/infrastructure/rate-limit/ephemeral-network-key.service.ts',
  networkKeySpec: 'apps/api/src/modules/design/design-session-auth.spec.ts',
  proxyHeaders: 'infrastructure/nginx/templates/includes/proxy-headers.conf.template',
  // The follow-up investigations `APP3-E01` owns.
  retryInvestigation: `${STOREFRONT}/test/components/studio-autosave-retry.test.tsx`,
  // The harness `APP3-E01` adds.
  runners: 'tools/smoke-app3-e01-runners.mjs',
  journey: 'tools/smoke-app3-e01-journey.mjs',
  studio: 'tools/smoke-app3-e01-studio.mjs',
  security: 'tools/smoke-app3-e01-security.mjs',
  orchestrator: 'tools/smoke-app3-e01.mjs',
  // The fixtures whose lifecycle `APP3-E01` made idempotent.
  studioFixtures: 'tools/smoke-app3-s01-fixtures.mjs',
  benchFixtures: 'tools/bench-app3-s03-fixtures.mjs',
  touchBenchmark: 'tools/bench-app3-s11-touch.mjs',
  transformBenchmark: 'tools/bench-app3-s03-transforms.mjs',
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;
export const EXPECTED_PATHS = 37;
export const EXPECTED_OPERATIONS = 42;
export const EXPECTED_SCHEMAS = 84;

/** The follow-ups `APP3-E01` must dispose of, and nothing it may invent. */
export const OWNED_FOLLOW_UPS = Object.freeze([
  'FU-APP3-S11-BENCHMARK-01',
  'FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01',
  'FU-APP3-TRANSFORM-BUDGET-01',
  'FU-APP3-S01-FIXTURE-IDEMPOTENCY-01',
  'FU-APP3-STUDIO-TOOL-RAIL-01',
  'FU-APP3-S04-GROUP-AUTHORITY-01',
  'FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01',
  // Raised BY this checkpoint, and owned by it for the same reason: a finding a
  // run makes and does not register is a finding that dies with the run.
  'FU-APP3-UPLOAD-REVISION-SEAM-01',
  'FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01',
  'FU-APP3-WORKER-BOOT-ORDER-01',
]);

/** Every disposition a follow-up may carry. Anything else is invented closure. */
export const DISPOSITIONS = Object.freeze([
  'COMPLETE — CLOSED_BY_APP3-E01',
  'OPEN — NONBLOCKING',
  'OPEN_NONBLOCKING_PHASE_DEBT',
  // A budget measured and missed. Distinct from `OPEN — NONBLOCKING`, which is a
  // question nobody has answered yet: this one is answered, with numbers, and
  // the phase carries the gap on purpose. `checkFollowUps` demands the numbers.
  'OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT',
  'DEFERRED_LATER_APP3',
  'BLOCKS_X01',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * One source file with its prose removed.
 *
 * Every rule runs against this rather than the raw text. A gate that read
 * comments fires on the paragraph that honestly explains why something is
 * forbidden — the failure five APP3 checkpoints each recorded once.
 */
export function code(rootDir, key) {
  return (read(rootDir, key) ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
}

export function collect(dir, pattern) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Every `APP3-E01` harness file, prose stripped.
 *
 * `except` names one file to leave out, so a rule can ask a question of the
 * capacity mechanism without asking it of the file whose whole job is to attack
 * that mechanism and prove the attack fails.
 */
export function harnessCode(rootDir, { except } = {}) {
  const excluded = except === undefined ? undefined : (CANONICAL_FILES[except] ?? except);
  return collect(join(rootDir, 'tools'), /^smoke-app3-e01.*\.mjs$/)
    .map((path) => relative(rootDir, path).replaceAll('\\', '/'))
    .filter((path) => path !== excluded)
    .map((path) => code(rootDir, path))
    .join('\n');
}

#!/usr/bin/env node
/**
 * `APP3-G07` — Template SVG sanitizer and deterministic normalization authority.
 *
 * An authority gate's failure mode is not that its prose disappears; it is that
 * the *next* checkpoint quietly becomes easier. Loosening one allowlist entry,
 * letting `DOMPurify.removed` be the security decision, dropping the fixed-point
 * second pass, allowing SVGO "just to tidy the output", floating a version to
 * `^`, or reading `width_px` from a root attribute instead of the `viewBox`
 * would each make `APP3-W01B` simpler to write and each would undo the reason
 * `APP3-G07` exists.
 *
 * So the checks assert the **negations** as hard as the rulings, and every
 * repository fact — the decision row, the fact table, the dependency table, the
 * untouched manifests, the untouched schema, the root script count — is
 * recomputed rather than restated.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-g07.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3B01N } from './check-app3-b01n.mjs';
import { EXPECTED_FACTS, SANITIZER_RULES, checkSanitizerPolicy } from './check-app3-g07-policy.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DECISION_ID = 'IMP-D047';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  matrix: 'docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md',
  sourceMap: 'docs/implementation/13-PHASE-SOURCE-MAP.md',
  security: 'docs/09-SECURITY-AND-ABUSE-PREVENTION.md',
  nfr: 'docs/10-NON-FUNCTIONAL-REQUIREMENTS.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  rootManifest: 'package.json',
  workerManifest: 'apps/worker/package.json',
  apiManifest: 'apps/api/package.json',
  lockfile: 'pnpm-lock.yaml',
  derivativeSchema: 'packages/database/src/schema/asset/asset-derivatives.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/** The fifteen rulings, each identified in the register row. */
const RULINGS = Object.freeze(
  Array.from({ length: 15 }, (_, index) => `PO-${String(index + 1).padStart(2, '0')}`),
);

const ROOT_SCRIPT_COUNT = 30;
const MIGRATION_COUNT = 34;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** The body of one `### x.y.z ` section, up to the next heading of any depth. */
function sectionBody(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n#{2,4} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| \`Key\` | \`Value\` |` rows of the §6.17.1 fact table, as a map. */
export function factTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.17.1 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

/** `| \`ID\` | portion | \`STATUS\` |` rows of §6.17.4, keyed `id :: portion`. */
export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.17.4 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [`${match[1]} :: ${match[2]}`, match[3]]),
  );
}

export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G07 :: whole checkpoint': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-W01B :: whole checkpoint, post-G07': 'BLOCKED_BY_APP3-G07_REVIEW_ACCEPTANCE',
  'APP3-B03 :: whole checkpoint, post-G07':
    'BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP_AND_TEMPLATE_SVG_REMAINS_UNAVAILABLE_UNTIL_APP3-W01B',
  'APP3-W01A :: whole checkpoint, post-G07': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-B01N :: whole checkpoint, post-G07': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G06 :: whole checkpoint, post-G07': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G04 :: whole checkpoint, post-G07': 'COMPLETE — REVIEW_ACCEPTED',
});

/** 1 — the decision exists exactly once, is LOCKED and carries every ruling. */
function checkDecision(register, fail) {
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length === 0) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is missing`);
    return;
  }
  if (rows.length > 1) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is declared ${String(rows.length)} times`);
    return;
  }
  const row = rows[0];
  for (const ruling of RULINGS) {
    if (!row.includes(`(${ruling})`)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
  // The dependency evidence must be in the decision, not only in a report.
  for (const [pattern, complaint] of [
    [/dompurify@3\.4\.13/, 'the exact sanitizer version'],
    [/jsdom@29\.1\.1/, 'the exact DOM version'],
    [/MPL-2\.0 OR Apache-2\.0/, "the sanitizer's license"],
    [/`MIT`/, "the DOM package's license"],
    [/22\.14\.0/, 'the locked runtime version it was checked against'],
    [/engines\.node/, 'the upstream engines evidence'],
    [/github\.com\/cure53\/DOMPurify/, 'the official sanitizer repository'],
    [/github\.com\/jsdom\/jsdom/, 'the official DOM repository'],
  ]) {
    if (!pattern.test(row)) fail(`${DECISION_ID} does not record ${complaint}`);
  }
}

/** Every row of `expected` a parsed table fails to match, by exact string. */
function reconcile(actual, expected, label, fail) {
  for (const [key, value] of Object.entries(expected)) {
    const measured = actual.get(key);
    if (measured === undefined) fail(`${label}: "${key}" is missing`);
    else if (measured !== value) fail(`${label}: "${key}" is "${measured}", expected "${value}"`);
  }
}

/** 2, 3 — the two tables in the phase plan reconcile exactly. */
function checkTables(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  reconcile(factTable(phase), EXPECTED_FACTS, `${CANONICAL_FILES.phase} §6.17.1`, fail);
  reconcile(
    dependencyTable(phase),
    EXPECTED_DEPENDENCIES,
    `${CANONICAL_FILES.phase} §6.17.4`,
    fail,
  );
}

/**
 * 4 — nothing was installed, and nothing was implemented.
 *
 * The strongest evidence an authority gate can offer: the sanitizer it selected
 * appears in the *documents* and in no manifest, no lockfile and no source file.
 *
 * **Mode-aware.** This is only true until `APP3-W01B` delivers, and W01B's whole
 * job is to install exactly what this gate named. So there are two consistent
 * worlds and no third: either W01B has not landed and nothing is installed, or
 * it has and the *selection* — the versions, the licences, the refusals — is
 * still what this gate proves. A gate that asserted only the first world would
 * have to be deleted by the checkpoint it exists to constrain, which is how an
 * authority stops constraining anything.
 */
/**
 * True only in the second consistent world: `APP3-W01B` recorded as delivered
 * **and** `IMP-D047` still locked. Both tokens, so a status line alone cannot
 * open the door.
 */
function isW01bDelivered(rootDir) {
  const phase = read(rootDir, 'phase') ?? '';
  return /APP3-W01B\s*=\s*COMPLETE/.test(phase) && /IMP-D047\s*=\s*LOCKED/.test(phase);
}

function checkNoInstallOrImplementation(rootDir, fail) {
  if (isW01bDelivered(rootDir)) return;
  for (const key of ['rootManifest', 'workerManifest', 'apiManifest']) {
    const manifest = read(rootDir, key) ?? '';
    for (const packageName of ['dompurify', 'jsdom', 'svgo', 'sanitize-svg', 'xmldom']) {
      if (manifest.includes(`"${packageName}"`)) {
        fail(`${CANONICAL_FILES[key]} gained "${packageName}"; APP3-G07 installs nothing`);
      }
    }
  }
  // Importer-scoped. `jsdom` legitimately appears in the resolved-packages
  // section as a transitive dependency of the frontend test environment; what
  // must not exist is a workspace that *declares* it.
  const lockfile = read(rootDir, 'lockfile') ?? '';
  for (const packageName of ['dompurify', 'jsdom']) {
    if (new RegExp(`\\n\\s+${packageName}:\\n\\s+specifier:`).test(lockfile)) {
      fail(`${CANONICAL_FILES.lockfile}: a workspace declares "${packageName}"; G07 installs none`);
    }
  }

  const sources = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) sources.push(full);
    }
  };
  walk(join(rootDir, 'apps/worker/src'));
  walk(join(rootDir, 'apps/api/src'));
  walk(join(rootDir, 'packages/domain-types/src'));

  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    const shown = file.slice(rootDir.length + 1);
    for (const token of ['dompurify', 'DOMPurify', 'jsdom', 'JSDOM']) {
      if (source.includes(token)) {
        fail(`${shown} implements the sanitizer; that is APP3-W01B's`);
      }
    }
    if (source.includes('TEMPLATE_SVG_SANITIZATION_POLICY_VERSION')) {
      fail(`${shown} implements the sanitization policy; that is APP3-W01B's`);
    }
  }

  // The staged refusal `APP3-W01A` shipped must still be the live behaviour.
  const staged = join(
    rootDir,
    'apps/worker/src/jobs/asset-normalization/application/normalized-derivative.service.ts',
  );
  if (
    existsSync(staged) &&
    !readFileSync(staged, 'utf8').includes('TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE')
  ) {
    fail('the staged Template SVG refusal is gone but no sanitizer was implemented');
  }
}

/** 5 — the schema, the OpenAPI artifact and the migrations are untouched. */
function checkNoArtifactChange(rootDir, fail) {
  const schema = read(rootDir, 'derivativeSchema') ?? '';
  for (const forbidden of [
    'sanitization_policy',
    'svg_policy',
    'sanitizer_version',
    'TEMPLATE_SVG',
    'SANITIZED',
  ]) {
    if (schema.includes(forbidden)) {
      fail(`asset_derivatives gained "${forbidden}"; the policy is worker-owned, not a column`);
    }
  }
  const raw = read(rootDir, 'openapi');
  if (raw !== undefined && JSON.stringify(JSON.parse(raw)).toLowerCase().includes('sanitiz')) {
    fail('the OpenAPI document mentions sanitization; APP3-G07 adds no HTTP surface');
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP3-G07 adds none`);
  }
}

/** 6 — the governance facts. */
function checkGovernance(rootDir, fail) {
  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('the root package.json is missing');
  } else {
    const count = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (count !== ROOT_SCRIPT_COUNT) {
      fail(`the root package.json declares ${String(count)} scripts; GOV-Q01 fixed it at 30`);
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const command of ['CMD-CHECK-APP3-G07', 'CMD-TEST-APP3-G07']) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.commandIndex} does not index ${command}`);
  }
  const phase = read(rootDir, 'phase') ?? '';
  if (!/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN/.test(phase)) {
    fail('the platform Zod/OpenAPI follow-up is no longer recorded as open');
  }
  for (const [key, needle, complaint] of [
    ['security', DECISION_ID, 'the sanitizer authority'],
    ['nfr', DECISION_ID, 'the determinism and reject-whole-file requirement'],
    ['roadmap', 'APP3-G07', 'the checkpoint'],
    ['matrix', 'IMP-D047', 'the sanitizer authority'],
    ['sourceMap', 'IMP-D047', 'the sanitizer authority'],
  ]) {
    if (!(read(rootDir, key) ?? '').includes(needle)) {
      fail(`${CANONICAL_FILES[key]} does not record ${complaint}`);
    }
  }
  // Template SVG must still be recorded as unavailable: G07 authorizes, W01B ships.
  const security = read(rootDir, 'security') ?? '';
  if (!/\*\*authorized but operationally\s+unavailable\*\*/.test(security)) {
    fail(`${CANONICAL_FILES.security}: Template SVG is no longer recorded as unavailable`);
  }
}

export function checkApp3G07(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkDecision(read(rootDir, 'register') ?? '', fail);
  checkTables(rootDir, fail);
  checkSanitizerPolicy(rootDir, CANONICAL_FILES, fail);
  checkNoInstallOrImplementation(rootDir, fail);
  checkNoArtifactChange(rootDir, fail);
  checkGovernance(rootDir, fail);

  // B01N chains W01A → G06 → B01 → P02 → G05 → P01 → F01/DB01 → G04 → G03 →
  // G02 → G01, so one call asserts the whole accepted authority this gate joins.
  for (const violation of checkApp3B01N(rootDir)) fail(`APP3-B01N regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3G07(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g07 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g07 — ${DECISION_ID} locks the Template SVG sanitizer: DOMPurify ` +
      `${SANITIZER_RULES.sanitizerVersion} on jsdom ${SANITIZER_RULES.domVersion}, exactly ` +
      'pinned, with the newest jsdom refused because the locked Node runtime cannot start it; ' +
      "DOMPurify's defaults are not the policy and `removed` is diagnostic only; XML parsing, " +
      'the SVG namespace, nine allowed elements and a closed attribute set, no URL, CSS, ' +
      'reference or font, a closed value/transform/path grammar with real path parsing, ' +
      'viewBox-derived metadata, four complexity limits whose boundary passes and boundary+1 ' +
      'rejects, whole-file rejection as UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG, a thirteen-step ' +
      'pipeline whose second serialization must equal the first, no SVGO, Sharp, regex or ' +
      'headless browser as sanitizer, and a worker-owned policy version — recorded across the ' +
      'phase plan, register, roadmap, traceability, source map, security and NFR documents ' +
      'while the repository gains no dependency, lockfile entry, source file, schema column, ' +
      'derivative kind, migration, HTTP surface or root script',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

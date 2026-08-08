#!/usr/bin/env node
/**
 * `APP3-G02` — Design Template lifecycle and Product archive authority (IMP-D042).
 *
 * The gap this closes was never "the states are wrong". `DRAFT | PUBLISHED |
 * ARCHIVED` were already canonical; what was missing was *transition* authority,
 * so the delivered repository could fuse publication into version creation,
 * offer no unpublish and no restore, and archive from any state without
 * contradicting any document. A lifecycle with states but no transition ids
 * cannot be implemented against or tested against.
 *
 * So this gate checks transitions, not vocabulary. It parses the LC-24 and LC-04
 * transition tables from the canonical spec, the bounded fact table from the
 * phase plan, the decision row, and the real repository — and it asserts the two
 * things a lifecycle gate most easily loses:
 *
 * - **Archive is not unpublish.** They are separate transitions with separate
 *   targets in both lifecycles; collapsing them is the classic regression.
 * - **The next phase has not been implemented yet.** No Template operation may
 *   appear in the committed OpenAPI while this is only an authority gate.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-g02.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  acceptedAdminTemplatePaths,
  acceptedPublicTemplatePaths,
} from './app3-accepted-surface.mjs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EXPECTED_TEMPLATE_TRANSITIONS, parseTransitions } from './check-app3-g02-lifecycle.mjs';
import { checkApp3G01 } from './check-app3-g01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  spec: 'docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md',
  matrix: 'docs/database/DB3_COMPLETENESS_MATRIX.md',
  productPolicy: 'apps/api/src/modules/catalog/domain/product-draft.policy.ts',
  templateSchema: 'packages/database/src/schema/design/design-templates.ts',
  versionSchema: 'packages/database/src/schema/design/design-template-versions.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const DECISION_ID = 'IMP-D042';

/** The ruled facts, recomputed from the phase plan's bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  'Template lifecycle id': 'LC-24',
  'Template aggregate module': 'DESIGN',
  'Template states': 'DRAFT PUBLISHED ARCHIVED',
  'Template editable state': 'DRAFT',
  'Template transition count': '6',
  'Template create transition': 'TR-LC24-01',
  'Template publish transition': 'TR-LC24-02',
  'Template unpublish transition': 'TR-LC24-03',
  'Template archive draft transition': 'TR-LC24-04',
  'Template archive published transition': 'TR-LC24-05',
  'Template restore transition': 'TR-LC24-06',
  'Template restore target': 'DRAFT',
  'Template direct archived to published': 'FORBIDDEN',
  'Template hard delete in APP3': 'NONE',
  'Template version mutability': 'IMMUTABLE_FROM_CREATION',
  'Template draft save behaviour': 'NEW_MONOTONIC_VERSION',
  'Template published_at write': 'SET_ONCE_NEVER_CLEARED',
  'Template unpublish scope': 'HEADER_ONLY',
  'Template public read selection': 'HIGHEST_PUBLISHED_VERSION',
  'Template clone result': 'INDEPENDENT_DOCUMENT_LINEAGE_ONLY',
  'APP3 template compatibility': 'EXACT_PRODUCT_SIDE_AREA',
  'APP3 template many to many': 'NOT_AUTHORIZED',
  G02_DB_CONTRIBUTION: 'NONE',
  'Product lifecycle id': 'LC-04',
  'Product transition count': '6',
  'Product archive draft transition': 'TR-LC04-06',
  'Product archive published transition': 'TR-LC04-02',
  'Product unpublish transition': 'TR-LC04-05',
  'Product archive hard delete': 'NONE',
  'Product archive cascades to template status': 'NO',
});

/** Dependency statuses this gate reconciles (§6.5.4). */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G02': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-G03': 'READY — NOT STARTED',
  'APP3-G04': 'NOT STARTED',
  'APP3-P01': 'READY — NOT STARTED',
  'APP3-P02': 'READY — NOT STARTED',
  'APP3-DB01': 'REQUIRED — AWAITING_G04_CONTRIBUTION',
  'APP3-B03': 'BLOCKED_BY_APP3_P01_AND_DB_DISPOSITION',
  'APP3-B04': 'BLOCKED_BY_APP3_P01_APP3_P02_APP3_G04_AND_DB_DISPOSITION',
  'APP3-B05': 'BLOCKED_BY_APP3_B04',
  'FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01': 'COMPLETE — CLOSED_BY_APP3-G02',
  'FU-APP2-PRODUCT-ARCHIVE-UI-01': 'DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION',
});

/** A Template operation must not exist while this is only an authority gate. */
const TEMPLATE_PATH_RE = /design-templates?|\btemplates?\b/i;

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** `| \`Key\` | \`Value\` |` rows of a markdown block, as a map. */
export function tableRows(block) {
  return new Map(
    block
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`[^|]*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** `| \`Key\` | \`Value\` |` rows between two headings, as a map. */
export function boundedTable(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start < 0) return new Map();
  const rest = text.slice(start + startHeading.length);
  const end = endHeading ? rest.indexOf(endHeading) : -1;
  return tableRows(end < 0 ? rest : rest.slice(0, end));
}

/**
 * One section's own body, bounded at the next heading of equal or higher level
 * (`FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01`).
 *
 * The previous form ended §6.5.4 at the literal `## 7. `, which was correct only
 * while §6.5.4 was the last subsection before §7. Once `APP3-G03` added §6.6 —
 * and `APP3-G04` §6.7 — every later dependency table fell inside G02's range,
 * and because `Map` keeps the *last* duplicate key, a later gate's status for
 * `APP3-G01` silently became the value this gate asserted. A section must be
 * read to its own end, not to a landmark that happens to follow it today.
 */
export function sectionBody(text, startHeading) {
  const start = text.indexOf(startHeading);
  if (start < 0) return '';
  const level = (/^#+/.exec(startHeading) ?? ['#'])[0].length;
  const rest = text.slice(start + startHeading.length);
  const end = rest.search(new RegExp(`\\n#{1,${String(level)}} `));
  return end < 0 ? rest : rest.slice(0, end);
}

function checkDecision(register, fail) {
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length !== 1) {
    fail(
      `${CANONICAL_FILES.register}: ${DECISION_ID} appears ${String(rows.length)} times, expected 1`,
    );
    return;
  }
  for (const ruling of ['PO-01', 'PO-02', 'PO-03', 'PO-04', 'PO-05', 'PO-06', 'PO-07', 'PO-08']) {
    if (!rows[0].includes(ruling)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!rows[0].trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
}

function checkFacts(phase, fail) {
  const facts = boundedTable(phase, '### 6.5.1 ', '### 6.5.2 ');
  for (const [key, expected] of Object.entries(EXPECTED_FACTS)) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked lifecycle fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
}

function checkDependencies(phase, fail) {
  const rows = tableRows(sectionBody(phase, '### 6.5.4 '));
  for (const [id, expected] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const actual = rows.get(id);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: dependency row for \`${id}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${id}\` is "${actual}", expected "${expected}"`);
    }
  }
}

/** LC-24 must define exactly the six ruled transitions and nothing else. */
function checkTemplateLifecycle(spec, fail) {
  const transitions = parseTransitions(spec, 'LC-24');
  if (transitions === null) {
    fail(`${CANONICAL_FILES.spec}: no "## LC-24" section found`);
    return;
  }
  const seen = new Map(transitions.map((t) => [t.id, `${t.from}→${t.to}`]));
  for (const [id, arrow] of Object.entries(EXPECTED_TEMPLATE_TRANSITIONS)) {
    const actual = seen.get(id);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.spec}: LC-24 is missing ${id} (${arrow})`);
    } else if (actual !== arrow) {
      fail(`${CANONICAL_FILES.spec}: LC-24 ${id} is ${actual}, expected ${arrow}`);
    }
  }
  const expectedCount = Object.keys(EXPECTED_TEMPLATE_TRANSITIONS).length;
  if (transitions.length !== expectedCount) {
    fail(
      `${CANONICAL_FILES.spec}: LC-24 defines ${String(transitions.length)} transitions, expected ${String(expectedCount)}`,
    );
  }
  if (transitions.some((t) => t.from === 'ARCHIVED' && t.to === 'PUBLISHED')) {
    fail(
      `${CANONICAL_FILES.spec}: LC-24 defines a direct ARCHIVED → PUBLISHED transition; restore must land in DRAFT`,
    );
  }
  for (const t of transitions) {
    if (/delete/i.test(t.to)) {
      fail(
        `${CANONICAL_FILES.spec}: LC-24 defines a delete transition (${t.id}); APP3 has no Template hard delete`,
      );
    }
  }
}

/** LC-04 keeps archive and unpublish distinct, and gains TR-LC04-06. */
function checkProductLifecycle(spec, fail) {
  const transitions = parseTransitions(spec, 'LC-04');
  if (transitions === null) {
    fail(`${CANONICAL_FILES.spec}: no "## LC-04" section found`);
    return;
  }
  const pick = (from, to) => transitions.filter((t) => t.from === from && t.to === to);
  for (const [label, from, to] of [
    ['archive from draft', 'DRAFT', 'ARCHIVED'],
    ['archive from published', 'PUBLISHED', 'ARCHIVED'],
    ['unpublish', 'PUBLISHED', 'DRAFT'],
  ]) {
    if (pick(from, to).length !== 1) {
      fail(
        `${CANONICAL_FILES.spec}: LC-04 defines ${String(pick(from, to).length)} ${from} → ${to} (${label}) transitions, expected 1`,
      );
    }
  }
  const archiveDraft = pick('DRAFT', 'ARCHIVED')[0];
  const unpublish = pick('PUBLISHED', 'DRAFT')[0];
  if (archiveDraft && unpublish && archiveDraft.id === unpublish.id) {
    fail(`${CANONICAL_FILES.spec}: LC-04 conflates archive and unpublish into ${archiveDraft.id}`);
  }
  if (transitions.length !== 6) {
    fail(
      `${CANONICAL_FILES.spec}: LC-04 defines ${String(transitions.length)} transitions, expected 6`,
    );
  }
}

/** The archive-from-draft the code already ships is now authorised. */
function checkProductCodeAuthorised(policy, spec, fail) {
  if (!/PRODUCT_ARCHIVABLE_STATES/.test(policy)) {
    fail(
      `${CANONICAL_FILES.productPolicy}: PRODUCT_ARCHIVABLE_STATES is gone; the archive authority cannot be reconciled`,
    );
    return;
  }
  const shipsDraftArchive = /PRODUCT_ARCHIVABLE_STATES\s*=\s*\[[^\]]*PRODUCT_DRAFT_STATE/.test(
    policy,
  );
  const authorised = (parseTransitions(spec, 'LC-04') ?? []).some(
    (t) => t.from === 'DRAFT' && t.to === 'ARCHIVED',
  );
  if (shipsDraftArchive && !authorised) {
    fail(
      `${CANONICAL_FILES.productPolicy}: archives from DRAFT while LC-04 authorises no DRAFT → ARCHIVED transition (FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01)`,
    );
  }
}

/** The schema still carries the shape PO-04 relies on. */
function checkSchema(root, fail) {
  const versions = read(root, 'versionSchema');
  const header = read(root, 'templateSchema');
  if (versions === undefined || header === undefined) {
    fail('design template schema files are missing');
    return;
  }
  if (!/publishedAt:\s*instant\('published_at'\)/.test(versions)) {
    fail(
      `${CANONICAL_FILES.versionSchema}: nullable published_at is gone; PO-04 needs it settable once`,
    );
  }
  if (/publishedAt:\s*instant\('published_at'\)\.notNull\(\)/.test(versions)) {
    fail(
      `${CANONICAL_FILES.versionSchema}: published_at became NOT NULL; a draft version must be able to hold null`,
    );
  }
  // `status` is declared through the shared `stateColumn()` primitive rather
  // than a quoted name, so it is matched on the declaration, not the literal.
  if (!/status:\s*stateColumn\(\)/.test(header)) {
    fail(`${CANONICAL_FILES.templateSchema}: the \`status\` state column is gone`);
  }
  if (
    !/DESIGN_TEMPLATE_STATES\s*=\s*\[[^\]]*'DRAFT'[^\]]*'PUBLISHED'[^\]]*'ARCHIVED'/s.test(header)
  ) {
    fail(
      `${CANONICAL_FILES.templateSchema}: DESIGN_TEMPLATE_STATES is no longer DRAFT/PUBLISHED/ARCHIVED`,
    );
  }
  for (const [column, source, key] of [
    ['current_version', header, 'templateSchema'],
    ['archived_at', header, 'templateSchema'],
    ['version', versions, 'versionSchema'],
  ]) {
    if (!source.includes(`'${column}'`)) {
      fail(`${CANONICAL_FILES[key]}: required column \`${column}\` is gone`);
    }
  }
}

/** No Template operation may exist while this is only an authority gate. */
function checkNoImplementation(root, fail) {
  const raw = read(root, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: OpenAPI artifact is missing`);
    return;
  }
  // `APP3-B03` is the backend checkpoint this ban was waiting for. Its two
  // paths come from the shared surface authority; everything else that looks
  // like a Template operation is still un-run.
  const delivered = [...acceptedAdminTemplatePaths(root), ...acceptedPublicTemplatePaths(root)];
  for (const path of Object.keys(JSON.parse(raw).paths ?? {}).filter(
    (p) => TEMPLATE_PATH_RE.test(p) && !delivered.includes(p),
  )) {
    fail(
      `${CANONICAL_FILES.openapi}: Template operation "${path}" exists, but no APP3 backend checkpoint has run`,
    );
  }
}

/** Every APP3-G02 invariant, as a list of failure strings. */
export function checkApp3G02(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const phase = read(rootDir, 'phase');
  const register = read(rootDir, 'register');
  const spec = read(rootDir, 'spec');
  const policy = read(rootDir, 'productPolicy');
  for (const [key, text] of [
    ['phase', phase],
    ['register', register],
    ['spec', spec],
    ['productPolicy', policy],
  ]) {
    if (text === undefined) fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
  }
  if (phase === undefined || register === undefined || spec === undefined) return failures;

  checkDecision(register, fail);
  checkFacts(phase, fail);
  checkDependencies(phase, fail);
  checkTemplateLifecycle(spec, fail);
  checkProductLifecycle(spec, fail);
  if (policy !== undefined) checkProductCodeAuthorised(policy, spec, fail);
  checkSchema(rootDir, fail);
  checkNoImplementation(rootDir, fail);

  for (const violation of checkApp3G01(rootDir)) {
    fail(`APP3-G01 regression: ${violation}`);
  }

  return failures;
}

async function main() {
  const failures = checkApp3G02();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g02 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g02 — Template lifecycle locked (${DECISION_ID}; LC-24 with ` +
      `${String(Object.keys(EXPECTED_TEMPLATE_TRANSITIONS).length)} transitions, no direct ` +
      'ARCHIVED → PUBLISHED, no hard delete; LC-04 = 6 with archive distinct from unpublish; ' +
      `${EXPECTED_FACTS.G02_DB_CONTRIBUTION === 'NONE' ? 'G02_DB_CONTRIBUTION = NONE' : ''}; ` +
      'no Template operation exists)',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

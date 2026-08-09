#!/usr/bin/env node
/**
 * `APP3-G01` — Product placement and side-media authority (IMP-D041).
 *
 * An authority gate is worth exactly as much as the repository facts it can
 * still prove, so this checker recomputes rather than reads: the ruling's fact
 * table, the decision register, the phase dependency table, the real Drizzle
 * schema and the committed OpenAPI artifact.
 *
 * Three checks exist specifically to catch the ways a gate rots:
 *
 * - **The schema still carries what the ruling relies on** — PO-02 and PO-03
 *   describe `background_asset_id`, `px_per_mm` and the area bounds, and losing
 *   one would leave the ruling describing a product that no longer exists.
 * - **The API surface matches the world this repository is in** — see
 *   `checkNoImplementation`.
 * - **`APP3-G01` claims no derivative kind** — `APP3-G04` owns that choice.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-g01.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkNextPhaseChronology } from './check-app2-closure-artifacts.mjs';
import {
  acceptedAdminTemplatePaths,
  acceptedAdminSideBackgroundPaths,
  acceptedPublicTemplateAssetPaths,
  acceptedPublicTemplatePaths,
  acceptedSessionPaths,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  app2Phase: 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md',
  productSides: 'packages/database/src/schema/catalog/product-sides.ts',
  embroideryAreas: 'packages/database/src/schema/catalog/embroidery-areas.ts',
  productMedia: 'packages/database/src/schema/catalog/product-media.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const DECISION_ID = 'IMP-D041';
export const CLOSURE_COMMIT = '8b5f3b0279b1920babd05b52014af3b853f526c0';

/** The ruled facts, recomputed from the phase plan's bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  'Placement authoring actor': 'ADMIN_ONLY',
  'Placement authoring checkpoint': 'APP3-A01',
  'Placement owning module': 'PRODUCT',
  'Public placement contract': 'READ_ONLY_MANIFEST',
  'Public placement checkpoint': 'APP3-B01',
  'Studio eligibility flag': 'studioEligible',
  'Side background association': 'product_sides.background_asset_id',
  'Side background delivery checkpoint': 'APP3-B02',
  'Side background derivative kind owner': 'APP3-G04',
  'Customer side selection': 'AUTO_WHEN_SINGLE_ELSE_CUSTOMER',
  'Customer area selection': 'AUTO_WHEN_SINGLE_ELSE_CUSTOMER',
  'Deterministic initial choice': 'FIRST_ACTIVE_BY_DISPLAY_ORDER',
  'Canonical Studio route': '/san-pham/[slug]/thiet-ke',
  'Studio route base': '/san-pham/[slug]',
  'Publication requires placement': 'NO',
  'Studio eligibility requires placement': 'YES',
  'Referenced placement mutability': 'IMMUTABLE_AFTER_FIRST_REFERENCE',
  'Referenced placement deletion': 'NO_HARD_DELETE',
  'Placement change representation': 'REPLACEMENT_ROW_WITH_RETIREMENT',
  G01_DB_DISPOSITION: 'REQUIRES_APP3_DB01',
});

/** Dependency statuses this gate reconciles (§6.4.4). */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G01': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-G02': 'READY — NOT STARTED',
  'APP3-G03': 'NOT STARTED',
  'APP3-G04': 'NOT STARTED',
  'APP3-B01': 'READY — NOT STARTED',
  'APP3-B02': 'BLOCKED_BY_APP3_G04',
  'APP3-A01': 'PLANNED — BLOCKED_BY_APP3_D01_AND_APP3_B01',
  'APP3-DB01': 'CONDITIONAL — AWAITING_G02_AND_G04_CONTRIBUTIONS',
});

/** Paths that must never be claimed as the canonical Studio route. */
export const REJECTED_STUDIO_ROUTES = Object.freeze(['/studio', '/editor', '/thiet-ke/[id]']);

/** Derivative kinds `APP3-G04` still owns; G01 may not select one. */
export const UNAPPROVED_KINDS = Object.freeze([
  'CATALOG_PREVIEW',
  'NORMALIZED',
  'PREVIEW_WATERMARKED',
]);

/** Placement columns PO-02/PO-03 depend on, per schema file. */
export const REQUIRED_SCHEMA_FIELDS = Object.freeze({
  productSides: [
    'background_asset_id',
    'image_width_px',
    'image_height_px',
    'physical_width_mm',
    'physical_height_mm',
    'px_per_mm',
    'display_order',
  ],
  embroideryAreas: [
    'bound_x_px',
    'bound_y_px',
    'bound_width_px',
    'bound_height_px',
    'max_width_mm',
    'max_height_mm',
    'display_order',
  ],
});

/** An APP3 placement operation must not exist while this gate is the frontier. */
const PLACEMENT_PATH_RE =
  /placement|\/sides?\b|embroidery|thiet-ke|design-sessions?|design-templates?/i;

/** Words that turn a mention of a rejected route into a claim it is canonical. */
const CLAIM_WORDS = ['canonical', 'approved', 'alias'];
const DENIAL_WORDS = ['reject', 'not ', 'never', 'competing', 'no ', 'rather than', 'instead of'];

/**
 * Prose split into sentences with newlines flattened.
 *
 * Markdown hard-wraps, so a claim and its denial routinely land on different
 * lines. Judging a wrapped clause on its own line is how a gate invents a
 * violation the author never wrote.
 */
export function sentences(text) {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.;:])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Lowercased prose with `*` and backtick emphasis removed, so `**not**` still
 * reads as "not".
 *
 * Underscore is deliberately **kept**: stripping it would turn every
 * `product_media` / `background_asset_id` identifier into an unsearchable word
 * and quietly disable the very checks that look for them.
 */
export function plain(sentence) {
  return sentence.replace(/[*`]/g, '').toLowerCase();
}

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** `| \`Fact\` | \`Value\` |` rows of the bounded ruling table, as a map. */
export function factTable(phaseText) {
  const start = phaseText.indexOf('### 6.4.1 ');
  const end = phaseText.indexOf('### 6.4.2 ');
  if (start < 0 || end < 0 || end < start) return new Map();
  return new Map(
    phaseText
      .slice(start, end)
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** `| \`ID\` | \`Status\` |` rows of the dependency table, as a map. */
export function dependencyTable(phaseText) {
  const start = phaseText.indexOf('### 6.4.4 ');
  if (start < 0) return new Map();
  const block = phaseText.slice(start);
  const end = block.search(/\n#{2,3} /);
  return new Map(
    (end < 0 ? block : block.slice(0, end))
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`[^|]*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Drizzle column names declared in a schema file. */
export function schemaColumns(source) {
  return new Set([...source.matchAll(/['"`]([a-z_]+)['"`]\)/g)].map((m) => m[1]));
}

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
  for (const ruling of ['PO-01', 'PO-02', 'PO-03', 'PO-04', 'PO-05', 'PO-06', 'PO-07']) {
    if (!row.includes(ruling)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
}

/** Every row of `expected` a parsed table fails to match, by exact string. */
function checkTable(rows, expected, what, fail) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = rows.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: ${what} \`${key}\` is missing`);
    } else if (actual !== value) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${value}"`);
    }
  }
  return rows;
}

/** PO-03: `product_media` must not become canonical side-background authority. */
function checkBackgroundOwnership(phase, productMedia, fail) {
  // Sentences, not lines: markdown hard-wraps, so "…rather than a new\n
  // `product_media.role`…" would otherwise read as a claim on its second line.
  for (const sentence of sentences(phase)) {
    const lower = plain(sentence);
    if (!lower.includes('product_media')) continue;
    if (!/background/.test(lower)) continue;
    if (DENIAL_WORDS.some((word) => lower.includes(word))) continue;
    fail(
      `${CANONICAL_FILES.phase}: promotes product_media to side-background authority:\n    ${sentence.slice(0, 140)}`,
    );
  }
  if (/SIDE_BACKGROUND/.test(productMedia)) {
    fail(
      `${CANONICAL_FILES.productMedia}: a SIDE_BACKGROUND role exists; PO-03 keeps the APP2 role set`,
    );
  }
}

/** PO-03: the derivative kind stays `APP3-G04`'s to choose. */
function checkNoKindSelected(phase, fail) {
  const start = phase.indexOf('## 6.4 ');
  const end = phase.indexOf('## 7. ');
  const block = start < 0 || end < 0 ? '' : phase.slice(start, end);
  for (const line of block.split('\n')) {
    if (!UNAPPROVED_KINDS.some((kind) => line.includes(kind))) continue;
    const lower = line.toLowerCase();
    if (/unapproved|not|never|owned by|stay|remain/.test(lower)) continue;
    fail(
      `APP3-G01 selects a derivative kind that APP3-G04 owns:\n    ${line.trim().slice(0, 140)}`,
    );
  }
}

/** PO-05: the Studio route extends the detail route and rejects competitors. */
function checkRouteAuthority(phase, app2Phase, facts, fail) {
  const studio = facts.get('Canonical Studio route');
  const base = facts.get('Studio route base');
  if (studio && base && !studio.startsWith(`${base}/`)) {
    fail(
      `${CANONICAL_FILES.phase}: Studio route "${studio}" does not extend the detail route "${base}"`,
    );
  }
  if (base && !app2Phase.includes(base)) {
    fail(
      `${CANONICAL_FILES.app2Phase}: accepted Product detail route "${base}" is no longer recorded`,
    );
  }
  const start = phase.indexOf('## 6.4 ');
  const end = phase.indexOf('## 7. ');
  const block = start < 0 || end < 0 ? phase : phase.slice(start, end);
  for (const line of block.split('\n')) {
    for (const path of REJECTED_STUDIO_ROUTES) {
      if (!line.includes(path)) continue;
      const lower = line.toLowerCase();
      if (!CLAIM_WORDS.some((word) => lower.includes(word))) continue;
      if (DENIAL_WORDS.some((word) => lower.includes(word))) continue;
      fail(
        `${CANONICAL_FILES.phase}: claims rejected Studio route ${path} as authorised:\n    ${line.trim().slice(0, 140)}`,
      );
    }
  }
}

/** The schema still carries every field the ruling describes. */
function checkSchema(root, fail) {
  for (const [key, fields] of Object.entries(REQUIRED_SCHEMA_FIELDS)) {
    const source = read(root, key);
    if (source === undefined) {
      fail(`${CANONICAL_FILES[key]}: placement schema file is missing`);
      continue;
    }
    const columns = schemaColumns(source);
    for (const field of fields) {
      if (!columns.has(field)) {
        fail(`${CANONICAL_FILES[key]}: required placement column \`${field}\` is gone`);
      }
    }
  }
}

/** The only placement paths IMP-D041 PO-02 authorises; delivery is B02's. */
const B01_PLACEMENT_PATHS = Object.freeze([
  '/api/admin/products/{productId}/placement',
  '/api/public/products/{slug}/placement',
]);

/**
 * The API surface, in whichever of two worlds this repository is in.
 *
 * G01 was the frontier when it ran and asserted that **no** placement operation
 * existed; `APP3-B01` then implemented PO-02. A gate still demanding that
 * absence would have to be deleted the day its own ruling was carried out, which
 * is how a gate becomes something people edit around. So exactly two consistent
 * worlds are accepted — before B01 (no placement path, and the plan does not
 * record it) and after (only the two ruled paths, and the plan records it) — and
 * every mixture fails. Their operation ids and auth are `check-app3-b01.mjs`'s
 * assertion, not this gate's.
 */
/** Mode-aware on `APP3-B02`: before it no such path may exist, after it this one may. */
const B02_DELIVERY_PATH = '/api/public/products/{slug}/sides/{sideCode}/background';

const b02Delivered = (phase) => /APP3-B02\s*=\s*COMPLETE/.test(phase ?? '');

function checkNoImplementation(root, phase, fail) {
  const raw = read(root, 'openapi');
  const delivered = /APP3-B01\s*=\s*COMPLETE/.test(phase);
  const allowed = [
    ...(delivered ? B01_PLACEMENT_PATHS : []),
    ...(b02Delivered(phase) ? [B02_DELIVERY_PATH] : []),
    // `APP3-B07` owns the two Session operations. G01 rules what a *placement*
    // path may be, and these are Session paths that merely match the pattern.
    ...acceptedSessionPaths(REPO_ROOT),
    // `APP3-B03` publishes the two Admin Design Template paths. The list comes
    // from the shared surface authority rather than a literal here: six gates
    // carried this same ban, and a seventh copy is how one of them keeps
    // refusing a route the phase already accepted.
    ...acceptedAdminTemplatePaths(REPO_ROOT),
    // `APP3-B05` publishes the two public Template reads. Same reasoning as
    // the line above, and a separate list because the Admin count must not
    // grow by a path that is not on the Admin surface.
    ...acceptedPublicTemplatePaths(REPO_ROOT),
    // `APP3-B05A` publishes the one contextual Template asset delivery. Kept
    // apart from the B05 list so the count of B05-owned operations stays two.
    ...acceptedPublicTemplateAssetPaths(REPO_ROOT),
    // `APP3-B02A` publishes the one Admin Side-background delivery. Same
    // reasoning again: it is a delivered checkpoint's operation, not an
    // un-run route this ban exists to catch.
    ...acceptedAdminSideBackgroundPaths(REPO_ROOT),
  ];
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: OpenAPI artifact is missing`);
  } else {
    const paths = Object.keys(JSON.parse(raw).paths ?? {});
    for (const path of paths.filter((p) => PLACEMENT_PATH_RE.test(p) && !allowed.includes(p))) {
      fail(
        delivered
          ? `${CANONICAL_FILES.openapi}: "${path}" is not an APP3-B01 placement operation`
          : `${CANONICAL_FILES.openapi}: APP3 placement operation "${path}" exists, but no APP3 backend checkpoint has run`,
      );
    }
    for (const path of allowed.filter((p) => !paths.includes(p))) {
      fail(`${CANONICAL_FILES.openapi}: APP3-B01 is recorded complete but "${path}" is missing`);
    }
  }
  const start = phase.indexOf('## 6.4 ');
  const end = phase.indexOf('## 7. ');
  const block = start < 0 || end < 0 ? '' : phase.slice(start, end);
  for (const claim of ['migration', 'OpenAPI', 'generated-client', 'Figma']) {
    const re = new RegExp(`APP3-G01[^.]*\\b${claim}\\b[^.]*\\b(implemented|added|created)\\b`, 'i');
    if (re.test(block)) {
      fail(`${CANONICAL_FILES.phase}: APP3-G01 claims a ${claim} implementation`);
    }
  }
}

/** Every APP3-G01 invariant, as a list of failure strings. */
export function checkApp3G01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const phase = read(rootDir, 'phase');
  const register = read(rootDir, 'register');
  const app2Phase = read(rootDir, 'app2Phase');
  const productMedia = read(rootDir, 'productMedia');
  for (const [key, text] of [
    ['phase', phase],
    ['register', register],
    ['app2Phase', app2Phase],
    ['productMedia', productMedia],
  ]) {
    if (text === undefined) fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
  }
  if (phase === undefined || register === undefined) return failures;

  checkDecision(register, fail);
  const facts = checkTable(
    factTable(phase),
    EXPECTED_FACTS,
    'machine-checked placement fact',
    fail,
  );
  checkTable(dependencyTable(phase), EXPECTED_DEPENDENCIES, 'dependency row for', fail);
  if (productMedia !== undefined) checkBackgroundOwnership(phase, productMedia, fail);
  checkNoKindSelected(phase, fail);
  if (app2Phase !== undefined) checkRouteAuthority(phase, app2Phase, facts, fail);
  checkSchema(rootDir, fail);
  checkNoImplementation(rootDir, phase, fail);

  for (const violation of checkNextPhaseChronology({
    repoRoot: rootDir,
    closureCommit: CLOSURE_COMMIT,
  }).violations) {
    fail(`APP2 closure chronology: ${violation}`);
  }

  return failures;
}

async function main() {
  const failures = checkApp3G01();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g01 — APP3-G01 placement authority locked (${DECISION_ID}; ` +
      `${String(Object.keys(EXPECTED_FACTS).length)} facts, ` +
      `${String(Object.keys(EXPECTED_DEPENDENCIES).length)} dependency rows; Studio route ` +
      `${EXPECTED_FACTS['Canonical Studio route']}; ${EXPECTED_FACTS.G01_DB_DISPOSITION}; ` +
      `no APP3 placement operation exists)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

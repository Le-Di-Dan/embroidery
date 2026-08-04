#!/usr/bin/env node
/**
 * `APP3-DB01` — placement lifecycle and derivative metadata migration.
 *
 * The one APP3 database checkpoint, carrying exactly two contribution groups:
 * placement stable identity and retirement (IMP-D041) and canonical derivative
 * output metadata (IMP-D044). This gate owns the migration-structure and
 * derivative half; `check-app3-db01-placement.mjs` owns the placement half.
 *
 * What it is really guarding is the seam between a *recorded* schema decision
 * and the schema itself. `APP3-G04` failed its first attempt because a ruling
 * asserted a column that did not exist; the inverse is just as easy to ship —
 * a migration that lands while the phase plan still calls it pending. So this
 * gate reads the committed migration, the journal, the Drizzle schema and the
 * phase plan together, and refuses any state where they disagree.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-db01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sectionBody, tableRows } from './check-app3-g02.mjs';
import { checkApp3G04 } from './check-app3-g04.mjs';
import { checkPlacementAuthority } from './check-app3-db01-placement.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MIGRATION_TAG = '0034_add_app3_placement_and_derivative_authority';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  migration: `packages/database/migrations/${MIGRATION_TAG}.sql`,
  journal: 'packages/database/migrations/meta/_journal.json',
  productSides: 'packages/database/src/schema/catalog/product-sides.ts',
  embroideryAreas: 'packages/database/src/schema/catalog/embroidery-areas.ts',
  derivatives: 'packages/database/src/schema/asset/asset-derivatives.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/** The derivative metadata quartet, in canonical order. */
export const METADATA_COLUMNS = Object.freeze(['width_px', 'height_px', 'media_type', 'byte_size']);

/** Constraints the derivative half must create. */
const DERIVATIVE_CONSTRAINTS = Object.freeze([
  'ck_asset_derivatives__metadata_all_or_none',
  'ck_asset_derivatives__metadata_positive',
  'ck_asset_derivatives__ready_normalized_metadata',
]);

/** Columns no APP3 checkpoint may add beside the quartet. */
const FORBIDDEN_COLUMNS = Object.freeze([
  'inspection_detail_id',
  'current_inspection_id',
  'processing_profile',
  'grant_purpose',
  'is_public',
]);

/** Derivative kinds no APP3 checkpoint may introduce. */
const FORBIDDEN_KINDS = Object.freeze([
  'EDITOR_SAFE',
  'STUDIO_PREVIEW',
  'DESIGN_PREVIEW',
  'SESSION_PREVIEW',
]);

/** The §6.8.1 facts, recomputed from the bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  'Migration tag': MIGRATION_TAG,
  'Migration count': '1',
  'Migration direction': 'FORWARD_ONLY',
  'Contribution groups': '2',
  'Placement code column': 'code',
  'Placement code backfill': 'LEGACY_UUID_WITHOUT_HYPHENS',
  'Placement code nullability': 'NOT_NULL_AFTER_BACKFILL',
  'Placement code uniqueness': 'PER_PARENT',
  'Placement code global uniqueness': 'NO',
  'Placement retirement column': 'retired_at',
  'Placement replacement column': 'superseded_by_id',
  'Placement replacement requires retirement': 'YES',
  'Placement self replacement': 'REJECTED',
  'Placement cross parent replacement': 'REJECTED',
  'Placement direct replacement cycle': 'REJECTED',
  'Placement replacement graph framework': 'NONE',
  'Protection sources': 'TEMPLATE_HEADER NON_TERMINAL_SESSION APPROVAL_SNAPSHOT',
  'Protected session states excluded': 'EXPIRED DELETED',
  'Protected update result': 'REJECTED',
  'Protected delete result': 'REJECTED',
  'Protected display change result': 'ALLOWED',
  'Protection enforcement': 'DATABASE_TRIGGER',
  'Protection cascade delete': 'NONE',
  'Derivative metadata columns': 'width_px height_px media_type byte_size',
  'Derivative metadata nullability': 'NULLABLE_ALL_OR_NONE',
  'Derivative metadata positive check': 'REQUIRED',
  'Derivative media type blank check': 'REQUIRED',
  'Derivative ready normalized requires metadata': 'YES',
  'Derivative historical rows may stay null': 'YES',
  'Derivative metadata backfill': 'NONE',
  'Migration object storage call': 'NONE',
  'Migration network call': 'NONE',
  'New tables': '0',
  'New derivative kinds': '0',
  'Forbidden columns added': '0',
  G01_DB_CONTRIBUTION_STATE: 'IMPLEMENTED_BY_APP3_DB01',
  G04_DB_CONTRIBUTION_STATE: 'IMPLEMENTED_BY_APP3_DB01',
});

/** Dependency statuses this checkpoint reconciles (§6.8.5). */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G01 :: whole checkpoint, post-DB01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G02 :: whole checkpoint, post-DB01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G03 :: whole checkpoint, post-DB01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G04 :: whole checkpoint, post-DB01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-DB01 :: whole checkpoint, post-DB01': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-P01 :: whole checkpoint, post-DB01': 'READY — NOT STARTED',
  'APP3-P02 :: whole checkpoint, post-DB01': 'READY — NOT STARTED',
  'APP3-B01 :: whole checkpoint, post-DB01': 'READY — NOT STARTED',
  'APP3-B02 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_B01_AND_APP3_B06',
  'APP3-B03 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_P01',
  'APP3-B04 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_P01_APP3_P02_AND_APP3_B06',
  'APP3-B06 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_P01',
  'APP3-B07 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_P01_AND_APP3_P02',
  'APP3-B08 :: whole checkpoint, post-DB01': 'BLOCKED_BY_APP3_P01_AND_APP3_P02',
  'APP3-W01 :: whole checkpoint, post-DB01': 'READY_BY_DB_DISPOSITION — NOT STARTED',
  'G01 contribution :: implementation state': 'IMPLEMENTED_BY_APP3_DB01',
  'G04 contribution :: implementation state': 'IMPLEMENTED_BY_APP3_DB01',
  'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: authority, post-DB01':
    'OPEN — AUTHORITY_LOCKED_BY_APP3-G04',
  'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: blocked by, post-DB01': 'APP3-B06',
  'FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01 :: whole follow-up, post-DB01':
    'COMPLETE — CLOSED_BY_APP3-DB01',
});

/** An APP3 asset or placement operation must not exist yet. */
const APP3_OPERATION_RE =
  /design-sessions?|design-templates?|template-assets?|session-uploads?|\/background\b|placement|thiet-ke/i;

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** `| \`ID\` | portion | \`STATUS\` |` rows of §6.8.5, keyed `id :: portion`. */
export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.8.5 ')
      .split(/\r?\n/)
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [`${m[1]} :: ${m[2]}`, m[3]]),
  );
}

/** Exactly one APP3 migration, correctly sequenced and journalled. */
function checkMigrationSequence(root, fail) {
  const dir = join(root, 'packages/database/migrations');
  if (!existsSync(dir)) {
    fail('packages/database/migrations: migration folder is missing');
    return;
  }
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'));
  const app3 = files.filter((name) => /placement|derivative_authority/.test(name));
  if (app3.length !== 1 || app3[0] !== `${MIGRATION_TAG}.sql`) {
    fail(
      `packages/database/migrations: expected exactly one APP3-DB01 migration named ${MIGRATION_TAG}.sql, found ${app3.join(', ') || 'none'}`,
    );
    return;
  }
  const numbers = files.map((name) => Number(name.slice(0, 4))).sort((a, b) => a - b);
  const highest = numbers[numbers.length - 1];
  if (highest !== 34) {
    fail(`packages/database/migrations: highest migration is ${String(highest)}, expected 34`);
  }
  if (new Set(numbers).size !== numbers.length) {
    fail('packages/database/migrations: duplicate migration numbers exist');
  }

  const journalRaw = read(root, 'journal');
  if (journalRaw === undefined) {
    fail(`${CANONICAL_FILES.journal}: migration journal is missing`);
    return;
  }
  const entries = JSON.parse(journalRaw).entries ?? [];
  const last = entries[entries.length - 1];
  if (last?.tag !== MIGRATION_TAG) {
    fail(`${CANONICAL_FILES.journal}: last journal tag is "${last?.tag ?? 'none'}"`);
  }
  if (entries.length !== files.length) {
    fail(
      `${CANONICAL_FILES.journal}: ${String(entries.length)} journal entries for ${String(files.length)} migration files`,
    );
  }
  if (existsSync(join(dir, 'meta', '0034_snapshot.json')) === false) {
    fail(`${CANONICAL_FILES.journal}: the 0034 snapshot is missing`);
  }
}

/** Forward-only, self-contained, and reaching nothing outside PostgreSQL. */
function checkMigrationShape(migration, fail) {
  const path = CANONICAL_FILES.migration;
  for (const forbidden of [
    ['a down/rollback section', /^--\s*down\b/im],
    ['a DROP TABLE', /\bDROP TABLE\b/i],
    [
      'an object-storage or network call',
      /\bhttp:\/\/|https:\/\/|dblink|pg_read_server_files|COPY\s+.*\bFROM\s+PROGRAM\b/i,
    ],
    ['an extension install', /\bCREATE EXTENSION\b/i],
  ]) {
    if (forbidden[1].test(migration)) {
      fail(`${path}: the migration contains ${forbidden[0]}`);
    }
  }
  if (!/APP3-DB01/.test(migration)) {
    fail(`${path}: the migration does not identify its checkpoint`);
  }
  if (/CREATE TABLE/i.test(migration)) {
    fail(`${path}: a table is created; APP3-DB01 adds no table`);
  }
}

/** The derivative quartet, its three CHECKs, and nothing beside them. */
function checkDerivativeMetadata(migration, schema, fail) {
  const path = CANONICAL_FILES.migration;
  for (const column of METADATA_COLUMNS) {
    if (!migration.includes(`ADD COLUMN "${column}"`)) {
      fail(`${path}: derivative column \`${column}\` is not added`);
    }
    if (!schema.includes(`'${column}'`)) {
      fail(`${CANONICAL_FILES.derivatives}: \`${column}\` is not declared in the schema`);
    }
    if (migration.includes(`ALTER COLUMN "${column}" SET NOT NULL`)) {
      fail(`${path}: \`${column}\` is made NOT NULL; historical rows must stay representable`);
    }
  }
  for (const constraint of DERIVATIVE_CONSTRAINTS) {
    if (!migration.includes(constraint)) {
      fail(`${path}: derivative constraint \`${constraint}\` is missing`);
    }
  }
  if (!/num_nonnulls\([^)]*\) in \(0, 4\)/.test(migration)) {
    fail(`${path}: the all-or-none invariant is not "0 or 4"`);
  }
  if (!/btrim\("asset_derivatives"\."media_type", E' \\t\\r\\n'\) <> ''/.test(migration)) {
    fail(`${path}: the media-type blank check no longer trims tabs and newlines`);
  }
  if (!/'NORMALIZED' or[\s\S]{0,120}'READY' or[\s\S]{0,160}= 4/.test(migration)) {
    fail(`${path}: a READY editor-safe derivative no longer requires the quartet`);
  }
  // No backfill, and no fabricated value: the preflight refuses to proceed
  // rather than inventing dimensions for a row it cannot measure.
  if (/UPDATE "asset_derivatives"/.test(migration)) {
    fail(`${path}: the migration backfills derivative metadata; values are never fabricated`);
  }
  for (const column of FORBIDDEN_COLUMNS) {
    if (migration.includes(`"${column}"`) || schema.includes(`'${column}'`)) {
      fail(`${path}: forbidden column \`${column}\` was added`);
    }
  }
  for (const kind of FORBIDDEN_KINDS) {
    if (migration.includes(kind) || schema.includes(kind)) {
      fail(`${path}: forbidden derivative kind \`${kind}\` was introduced`);
    }
  }
  if (!schema.includes("'NORMALIZED'")) {
    fail(`${CANONICAL_FILES.derivatives}: the editor-safe kind is gone`);
  }
}

function checkFacts(phase, fail) {
  const facts = tableRows(sectionBody(phase, '### 6.8.1 '));
  for (const [key, expected] of Object.entries(EXPECTED_FACTS)) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked migration fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
}

function checkDependencies(phase, fail) {
  const rows = dependencyTable(phase);
  for (const [id, expected] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const actual = rows.get(id);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: dependency row for \`${id}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${id}\` is "${actual}", expected "${expected}"`);
    }
  }
}

/** The only APP3 operations delivered so far; `APP3-B01` owns all three. */
const B01_PATHS = Object.freeze([
  '/api/admin/products/{productId}/placement',
  '/api/public/products/{slug}/placement',
]);

/**
 * A database checkpoint delivers no operation — and neither does any checkpoint
 * that has not run.
 *
 * `APP3-DB01` was the frontier when it ran, so the absence was absolute. It no
 * longer is: `APP3-B01` shipped the three placement operations its own ruling
 * called for. Rather than delete the check the day it first mattered, it accepts
 * exactly two consistent worlds — before B01 (no APP3 operation, and the plan
 * does not record it) and after (only the two placement paths, and the plan
 * records it) — and refuses every mixture, including a delivered checkpoint
 * whose operation has since disappeared.
 */
function checkNoImplementation(root, phase, fail) {
  const raw = read(root, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: OpenAPI artifact is missing`);
    return;
  }
  const delivered = /APP3-B01\s*=\s*COMPLETE/.test(phase ?? '');
  const allowed = delivered ? B01_PATHS : [];
  const paths = Object.keys(JSON.parse(raw).paths ?? {});
  for (const path of paths.filter((p) => APP3_OPERATION_RE.test(p) && !allowed.includes(p))) {
    fail(
      delivered
        ? `${CANONICAL_FILES.openapi}: "${path}" belongs to no delivered APP3 checkpoint`
        : `${CANONICAL_FILES.openapi}: APP3 operation "${path}" exists, but no APP3 backend checkpoint has run`,
    );
  }
  for (const path of allowed.filter((p) => !paths.includes(p))) {
    fail(`${CANONICAL_FILES.openapi}: APP3-B01 is recorded complete but "${path}" is missing`);
  }
}

/** Every APP3-DB01 invariant, as a list of failure strings. */
export function checkApp3Db01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const texts = {
    phase: read(rootDir, 'phase'),
    migration: read(rootDir, 'migration'),
    productSides: read(rootDir, 'productSides'),
    embroideryAreas: read(rootDir, 'embroideryAreas'),
    derivatives: read(rootDir, 'derivatives'),
  };
  for (const [key, text] of Object.entries(texts)) {
    if (text === undefined) fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
  }
  if (texts.phase === undefined || texts.migration === undefined) return failures;

  checkMigrationSequence(rootDir, fail);
  checkMigrationShape(texts.migration, fail);
  checkFacts(texts.phase, fail);
  checkDependencies(texts.phase, fail);
  if (texts.derivatives !== undefined) {
    checkDerivativeMetadata(texts.migration, texts.derivatives, fail);
  }
  checkPlacementAuthority({
    migration: texts.migration,
    schemas: { productSides: texts.productSides, embroideryAreas: texts.embroideryAreas },
    files: CANONICAL_FILES,
    fail,
  });
  checkNoImplementation(rootDir, texts.phase, fail);

  const g04 = checkApp3G04(rootDir);
  for (const violation of g04.failures) fail(`APP3-G04 regression: ${violation}`);
  if (g04.failures.length === 0 && g04.mode !== 'DERIVATIVE_METADATA_IMPLEMENTED') {
    fail(`APP3-G04 reports mode "${g04.mode}", expected DERIVATIVE_METADATA_IMPLEMENTED`);
  }

  return failures;
}

async function main() {
  const failures = checkApp3Db01();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-db01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-db01 — one forward-only migration (${MIGRATION_TAG}) carrying two contribution ` +
      'groups: per-parent stable `code` backfilled deterministically and proved before NOT NULL, ' +
      'retirement/replacement with same-parent and direct-cycle guards, database-enforced ' +
      'protection once a Template header, non-terminal Session or approval snapshot references ' +
      `the row; and ${METADATA_COLUMNS.join(', ')} on asset_derivatives, all-or-none, positive, ` +
      'mandatory for a READY editor-safe derivative and never backfilled (no table, no kind, ' +
      'no forbidden column, no APP3 operation)',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

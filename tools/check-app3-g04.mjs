#!/usr/bin/env node
/**
 * `APP3-G04` — editor-safe media, asset eligibility and complexity authority
 * (IMP-D044).
 *
 * This gate exists because the first `APP3-G04` attempt could not be delivered:
 * the ruling it was issued asserted that `asset_derivatives` already carried
 * intrinsic dimensions, and the measured schema carries none. So the one thing
 * this checker must never do is assume either state. It verifies the *pair* —
 * the recorded database contribution and the real schema — and accepts exactly
 * two consistent worlds:
 *
 * - **before `APP3-DB01`**: the four metadata columns are absent, the
 *   contribution is recorded as required, and `APP3-DB01` is ready to run;
 * - **after `APP3-DB01`**: all four columns exist with their all-or-none and
 *   positive checks, and `APP3-DB01` is recorded as delivered.
 *
 * Everything between those — half the columns, a contribution of `NONE` with no
 * columns, a still-pending contribution after `APP3-DB01` claims completion — is
 * a contradiction, not a stage. A gate that permanently demanded the columns stay
 * absent would have to be deleted the day the migration lands, which is how
 * authority checks quietly stop being run.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-g04.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sectionBody, tableRows } from './check-app3-g02.mjs';
import { checkApp3G03 } from './check-app3-g03.mjs';
import {
  acceptedAdminTemplatePaths,
  acceptedPublicTemplatePaths,
  acceptedSurface,
} from './app3-accepted-surface.mjs';
import { LIMIT_FACTS, MEDIA_FACTS, checkMediaAuthority } from './check-app3-g04-media.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  security: 'docs/09-SECURITY-AND-ABUSE-PREVENTION.md',
  derivatives: 'packages/database/src/schema/asset/asset-derivatives.ts',
  assets: 'packages/database/src/schema/asset/assets.ts',
  inspections: 'packages/database/src/schema/asset/asset-inspections.ts',
  productSides: 'packages/database/src/schema/catalog/product-sides.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const DECISION_ID = 'IMP-D044';

export const RULINGS = Object.freeze(
  Array.from({ length: 12 }, (_, i) => `PO-${String(i + 1).padStart(2, '0')}`),
);

/** The editor-safe kind is reused, never invented. */
export const EDITOR_SAFE_KIND = 'NORMALIZED';

/** Kind names no checkpoint may add to the derivative enum. */
export const FORBIDDEN_KINDS = Object.freeze([
  'EDITOR_SAFE',
  'STUDIO_PREVIEW',
  'DESIGN_PREVIEW',
  'SESSION_PREVIEW',
]);

/** The canonical derivative metadata quartet, as column names. */
export const METADATA_COLUMNS = Object.freeze(['width_px', 'height_px', 'media_type', 'byte_size']);

/** Columns `APP3-DB01` is forbidden to add alongside the quartet. */
const FORBIDDEN_COLUMNS = Object.freeze([
  'inspection_detail_id',
  'current_inspection_id',
  'profile',
  'grant_purpose',
]);

/** The kind, dimension and contribution facts this file owns (§6.7.1). */
export const CORE_FACTS = Object.freeze({
  'Editor-safe derivative kind': EDITOR_SAFE_KIND,
  'New editor derivative kinds': 'NONE',
  'PREVIEW_WATERMARKED studio eligibility': 'NEVER',
  'CATALOG_PREVIEW studio eligibility': 'NEVER',
  'Original studio eligibility': 'NEVER',
  'Derivative kind alone grants access': 'NO',
  'Studio dimension fields': 'width_px height_px media_type byte_size',
  'Dimension authority table': 'asset_derivatives',
  'Inspection detail runtime authority': 'NEVER',
  'Source asset metadata as derivative metadata': 'FORBIDDEN',
  'Missing dimension result': 'INELIGIBLE_NOT_GUESSED',
  'Raster dimension source': 'INSPECTED_DECODED_IMAGE',
  'Svg dimension source': 'BOUNDED_VIEWBOX',
  'Svg width height without viewbox': 'INSUFFICIENT',
  'Placement scale basis': 'INTRINSIC_DIMENSIONS_AND_PX_PER_MM',
  'Object storage read on document write': 'FORBIDDEN',
  G04_DB_CONTRIBUTION: 'REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA',
  'Derivative metadata columns': 'width_px height_px media_type byte_size',
  'Derivative metadata nullability': 'NULLABLE_ALL_OR_NONE',
  'Derivative metadata initial not null': 'NO',
  'Derivative metadata backfill': 'NOT_REQUIRED_FOR_APP3_ENTRY',
  'Derivative metadata fabrication': 'FORBIDDEN',
  'Derivative metadata write timing': 'ATOMIC_WITH_READY',
  'Forbidden derivative columns': 'INSPECTION_REF PROFILE_ENUM GRANT_PURPOSE',
});

export const EXPECTED_FACTS = Object.freeze({ ...CORE_FACTS, ...MEDIA_FACTS, ...LIMIT_FACTS });

/**
 * Dependency statuses this gate reconciles (§6.7.4), keyed `id :: portion`.
 *
 * `APP3-DB01` is deliberately absent: its status is the one row that legitimately
 * differs before and after the migration, so it is verified against the real
 * schema in `checkDatabaseContribution` instead of pinned here.
 */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G01 :: whole checkpoint, post-G04': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G02 :: whole checkpoint, post-G04': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G03 :: whole checkpoint, post-G04': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G04 :: whole checkpoint, post-G04': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-B02 :: G04 portion': 'UNBLOCKED_BY_G04',
  'APP3-B04 :: asset-eligibility portion': 'UNBLOCKED_BY_G04',
  'APP3-B06 :: asset-policy portion': 'UNBLOCKED_BY_G04',
  'APP3-P01 :: font/media schema portion': 'UNBLOCKED_BY_G04',
  'APP3-P02 :: complexity-validation portion': 'UNBLOCKED_BY_G04',
  'APP3-S11 :: autosave cadence ownership': 'ROUTED_BY_G04',
  'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: authority': 'OPEN — AUTHORITY_LOCKED_BY_APP3-G04',
  'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: final owner': 'APP3-B02',
  'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: blocked by': 'APP3-DB01 + APP3-B06',
  'FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 :: whole follow-up': 'COMPLETE — CLOSED_BY_APP3-G04',
  'FU-APP3-G03-QUALITY-AGGREGATE-01 :: whole follow-up': 'DEFERRED — REGRESSION_ACTIVITY_ONLY',
});

/** The `APP3-DB01` row, per schema state. */
const DB01_PENDING = 'REQUIRED — READY_FOR_EXECUTION';
const DB01_ROW = 'APP3-DB01 :: whole checkpoint, post-G04';

/** An APP3 asset operation must not exist while this is only an authority gate. */
const APP3_ASSET_PATH_RE =
  /design-sessions?|design-templates?|template-assets?|session-uploads?|\/background\b|thiet-ke/i;

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** `| \`ID\` | portion | \`STATUS\` |` rows of §6.7.4, keyed `id :: portion`. */
export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.7.4 ')
      .split(/\r?\n/)
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [`${m[1]} :: ${m[2]}`, m[3]]),
  );
}

/** Markdown hard-wraps, so a claim split across two lines would read as absent. */
export function flatten(text) {
  return text.replace(/\s+/g, ' ');
}

function checkDecision(register, fail) {
  const rows = register.split(/\r?\n/).filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length !== 1) {
    fail(
      `${CANONICAL_FILES.register}: ${DECISION_ID} appears ${String(rows.length)} times, expected 1`,
    );
    return '';
  }
  for (const ruling of RULINGS) {
    if (!rows[0].includes(ruling)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!rows[0].trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
  for (const [label, pattern] of [
    ['the editor-safe derivative kind', new RegExp(`\`${EDITOR_SAFE_KIND}\` derivative kind`)],
    ['the derivative metadata quartet', /`width_px`, `height_px`, `media_type`, `byte_size`/],
    ['the database contribution', /REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA/],
    ['that inspection detail is never runtime authority', /never runtime state authority/i],
  ]) {
    if (!pattern.test(rows[0])) {
      fail(`${CANONICAL_FILES.register}: the ${DECISION_ID} row no longer records ${label}`);
    }
  }
  return rows[0];
}

function checkFacts(phase, fail) {
  const facts = tableRows(sectionBody(phase, '### 6.7.1 '));
  for (const [key, expected] of Object.entries(CORE_FACTS)) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked media fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
  return facts;
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
  return rows;
}

/** The derivative enum still offers the reused kind and no invented one. */
function checkDerivativeKinds(derivatives, fail) {
  const enumBlock = /ASSET_DERIVATIVE_KINDS\s*=\s*\[([\s\S]*?)\]/.exec(derivatives);
  if (enumBlock === null) {
    fail(`${CANONICAL_FILES.derivatives}: ASSET_DERIVATIVE_KINDS is gone`);
    return;
  }
  const kinds = [...enumBlock[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  if (!kinds.includes(EDITOR_SAFE_KIND)) {
    fail(
      `${CANONICAL_FILES.derivatives}: \`${EDITOR_SAFE_KIND}\` is no longer a derivative kind; PO-01 reuses it rather than adding one`,
    );
  }
  for (const forbidden of FORBIDDEN_KINDS) {
    if (kinds.includes(forbidden)) {
      fail(
        `${CANONICAL_FILES.derivatives}: derivative kind \`${forbidden}\` exists; PO-01 authorises no new editor kind`,
      );
    }
  }
}

/**
 * The recorded contribution and the real schema agree.
 *
 * Both directions matter. A contribution of `NONE` beside absent columns is the
 * exact false premise that failed the first attempt; a contribution still marked
 * pending after `APP3-DB01` reports itself delivered is the same error running
 * the other way.
 */
function checkDatabaseContribution(derivatives, rows, fail) {
  const present = METADATA_COLUMNS.filter((column) => derivatives.includes(`'${column}'`));
  const db01 = rows.get(DB01_ROW);
  if (db01 === undefined) {
    fail(`${CANONICAL_FILES.phase}: dependency row for \`${DB01_ROW}\` is missing`);
  }
  const delivered = db01 !== undefined && /COMPLETE|ACCEPTED|DELIVERED/.test(db01);

  if (present.length > 0 && present.length < METADATA_COLUMNS.length) {
    fail(
      `${CANONICAL_FILES.derivatives}: derivative metadata is half-added (${present.join(', ')}); PO-12 is all four or none`,
    );
    return 'INCONSISTENT';
  }
  if (present.length === 0) {
    if (delivered) {
      fail(
        `${CANONICAL_FILES.phase}: \`APP3-DB01\` is recorded as "${db01 ?? ''}" while no derivative metadata column exists`,
      );
      return 'INCONSISTENT';
    }
    if (db01 !== undefined && db01 !== DB01_PENDING) {
      fail(`${CANONICAL_FILES.phase}: \`${DB01_ROW}\` is "${db01}", expected "${DB01_PENDING}"`);
    }
    return 'REQUIRED_SCHEMA_CONTRIBUTION_PENDING';
  }

  if (!delivered) {
    fail(
      `${CANONICAL_FILES.phase}: the derivative metadata columns exist while \`APP3-DB01\` is still recorded as "${db01 ?? ''}"`,
    );
  }
  // Drizzle interpolates columns as `${t.widthPx}`, so the constraints are
  // matched on the declaration the schema actually writes, never on the SQL
  // column name a hand-written migration would use.
  for (const [label, pattern] of [
    ['the all-or-none invariant', /num_nonnulls|is null[\s\S]{0,300}is not null/i],
    ['positive width/height checks', /width_?[Pp]x[\s\S]{0,200}>\s*0/],
    ['a positive byte-size check', /byte_?[Ss]ize[\s\S]{0,200}>\s*0/],
  ]) {
    if (!pattern.test(derivatives)) {
      fail(`${CANONICAL_FILES.derivatives}: ${label} is missing from the metadata columns`);
    }
  }
  return 'DERIVATIVE_METADATA_IMPLEMENTED';
}

/** Source metadata stays source metadata; inspection history stays history. */
function checkMetadataOwnership(root, fail) {
  const assets = read(root, 'assets');
  const inspections = read(root, 'inspections');
  const sides = read(root, 'productSides');
  if (assets === undefined || inspections === undefined || sides === undefined) {
    fail('asset or catalog schema files are missing');
    return;
  }
  for (const column of ['mime_type', 'size_bytes']) {
    if (!assets.includes(`'${column}'`)) {
      fail(
        `${CANONICAL_FILES.assets}: source column \`${column}\` is gone; PO-12 keeps it as source-binary metadata`,
      );
    }
  }
  if (!inspections.includes("text('detail')")) {
    fail(`${CANONICAL_FILES.inspections}: the append-only \`detail\` evidence column is gone`);
  }
  for (const forbidden of FORBIDDEN_COLUMNS) {
    if (new RegExp(`'${forbidden}'`).test(read(root, 'derivatives') ?? '')) {
      fail(
        `${CANONICAL_FILES.derivatives}: column \`${forbidden}\` exists; PO-12 forbids it alongside the metadata quartet`,
      );
    }
  }
  for (const column of ['image_width_px', 'image_height_px', 'px_per_mm']) {
    if (!sides.includes(`'${column}'`)) {
      fail(
        `${CANONICAL_FILES.productSides}: placement geometry column \`${column}\` is gone; PO-07 scales from it`,
      );
    }
  }
}

/** Mode-aware on `APP3-B02`: before it no such path may exist, after it this one may. */
const B02_DELIVERY_PATH = '/api/public/products/{slug}/sides/{sideCode}/background';
const b02Delivered = (phase) => /APP3-B02\s*=\s*COMPLETE/.test(phase ?? '');

/** No APP3 asset operation may exist beyond the ones a delivered checkpoint owns. */
function checkNoImplementation(root, fail) {
  const allowed = b02Delivered(read(root, 'phase')) ? [B02_DELIVERY_PATH] : [];
  const raw = read(root, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: OpenAPI artifact is missing`);
    return;
  }
  // `APP3-B07` owns the two Session routes; they are a delivered checkpoint's
  // operations, not the un-run asset surface this ban is about.
  const sessionRoutes = acceptedSurface(root).designSessionRoutes;
  for (const path of Object.keys(JSON.parse(raw).paths ?? {}).filter(
    (p) =>
      APP3_ASSET_PATH_RE.test(p) &&
      !allowed.includes(p) &&
      !(sessionRoutes && p.includes('/design-sessions')) &&
      // `APP3-B03`'s Admin Template reads are a delivered checkpoint's
      // operations, not the un-run asset surface this ban is about.
      !acceptedAdminTemplatePaths(root).includes(p) &&
      // `APP3-B05`'s public Template reads are a delivered checkpoint's
      // operations, not the un-run asset surface this ban is about.
      !acceptedPublicTemplatePaths(root).includes(p),
  )) {
    fail(
      `${CANONICAL_FILES.openapi}: APP3 asset operation "${path}" exists, but no APP3 backend checkpoint has run`,
    );
  }
}

/** Every APP3-G04 invariant, as `{failures, mode}`. */
export function checkApp3G04(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const texts = {
    phase: read(rootDir, 'phase'),
    register: read(rootDir, 'register'),
    security: read(rootDir, 'security'),
    derivatives: read(rootDir, 'derivatives'),
  };
  for (const [key, text] of Object.entries(texts)) {
    if (text === undefined) fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
  }
  if (Object.values(texts).some((text) => text === undefined)) return { failures, mode: 'UNKNOWN' };

  checkDecision(texts.register, fail);
  const facts = checkFacts(texts.phase, fail);
  const rows = checkDependencies(texts.phase, fail);
  checkDerivativeKinds(texts.derivatives, fail);
  const mode = checkDatabaseContribution(texts.derivatives, rows, fail);
  checkMetadataOwnership(rootDir, fail);
  checkNoImplementation(rootDir, fail);
  checkMediaAuthority({
    rulings: sectionBody(texts.phase, '### 6.7.2 '),
    facts,
    security: texts.security,
    files: CANONICAL_FILES,
    fail,
  });

  for (const violation of checkApp3G03(rootDir)) fail(`APP3-G03 regression: ${violation}`);

  return { failures, mode };
}

async function main() {
  const { failures, mode } = checkApp3G04();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g04 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g04 — PASS — ${mode} (${DECISION_ID}; ${EDITOR_SAFE_KIND} is the sole ` +
      'editor-safe kind with no new enum value; three application profiles, three contextual ' +
      'delivery classes and no generic public asset endpoint; ' +
      `${METADATA_COLUMNS.join(', ')} are mandatory for Studio eligibility and owned by ` +
      `asset_derivatives, never by inspection history; G04_DB_CONTRIBUTION = ` +
      `${CORE_FACTS.G04_DB_CONTRIBUTION}; no APP3 asset operation exists)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

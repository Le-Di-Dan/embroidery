#!/usr/bin/env node
/**
 * `APP3-G06` — normalization dispatch and raster/SVG staging authority.
 *
 * `APP3-W01` stopped because a worker cannot derive a processing profile from an
 * event appended before the association that defines it exists. `IMP-D046` fixes
 * the dispatch, and this gate keeps the fix honest.
 *
 * The failure mode it is built against is a *convenient* one, not a careless
 * one: adding a second queue, a sweep, a profile column or a caller-supplied
 * profile flag would each make W01A trivially implementable and each would
 * silently undo the reason G06 exists. So the checks assert the **negations** as
 * hard as the rulings — no polling architecture, no persisted profile, no
 * profile in the payload, no sanitizer chosen here, no implementation at all.
 *
 * Every fact is recomputed from the repository: the fact table, the decision
 * register, the dependency table, and the real source tree that must stay empty
 * of implementation until human acceptance.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-g06.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3B01 } from './check-app3-b01.mjs';
import { checkNormalizationEvents } from './check-app3-g06-events.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DECISION_ID = 'IMP-D046';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  audit: 'docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md',
  security: 'docs/09-SECURITY-AND-ABUSE-PREVENTION.md',
  nfr: 'docs/10-NON-FUNCTIONAL-REQUIREMENTS.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  rootManifest: 'package.json',
  outboxSchema: 'packages/database/src/schema/platform/outbox-events.ts',
  derivativeSchema: 'packages/database/src/schema/asset/asset-derivatives.ts',
  templateAssets: 'packages/database/src/schema/design/design-template-assets.ts',
  sessionAssets: 'packages/database/src/schema/design/design-session-assets.ts',
  productSides: 'packages/database/src/schema/catalog/product-sides.ts',
});

/** The §6.16.1 facts, recomputed from the bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  'Existing asset event': 'asset.inspection.requested',
  'Existing asset event payload': 'schemaVersion + assetId',
  'Existing event append point': 'UPLOAD_TRANSACTION_UPLOADED_TO_INSPECTING',
  'Association state at inspection': 'NOT_YET_AVAILABLE',
  'Existing SVG sanitizer': 'NONE',
  'New normalization event': 'asset.normalization.requested',
  'New normalization event count': '1',
  'Normalization payload schema version': '1',
  'Normalization policy version': '1',
  'Normalization job kind': 'ASSET_PROCESSING',
  'Normalization queue architecture': 'EXISTING_OUTBOX_AND_WORKER',
  'New queue or scheduler': 'NONE',
  'Normalization migration': 'NONE',
  'Profile persistence': 'NONE',
  'New derivative kind': 'NONE',
  'Association reference kinds':
    'PRODUCT_SIDE_BACKGROUND DESIGN_TEMPLATE_ASSET DESIGN_SESSION_ASSET',
  'Association reference fields': 'productSideId designTemplateAssetId designSessionAssetId',
  'Profile derivation': 'WORKER_REREADS_ASSOCIATION_AT_CLAIM',
  'Producer transaction': 'SAME_TRANSACTION_AS_ASSOCIATION_WRITE',
  'Stale association outcome': 'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
  'W01 disposition': 'REPLANNED_INTO_W01A_AND_W01B',
  'W01A source scope': 'RASTER_ONLY',
  'Template SVG availability': 'AUTHORIZED_BUT_UNAVAILABLE_UNTIL_W01B',
  'SVG sanitizer owner': 'APP3-G07',
  'SIDE_BACKGROUND trigger owner': 'APP3-B01N',
  'B01N HTTP operations': '0',
  'G06 application change': 'NONE',
});

/** Dependency statuses this gate reconciles (§6.16.3). */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G06 :: whole checkpoint': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-W01 :: first attempt, post-G06': 'FAILED — MANUAL_INTERVENTION_REQUIRED',
  'APP3-W01 :: disposition, post-G06': 'REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B',
  'APP3-W01A :: whole checkpoint, post-G06': 'BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE',
  'APP3-B01N :: whole checkpoint, post-G06': 'BLOCKED_BY_APP3-W01A',
  'APP3-G07 :: whole checkpoint, post-G06': 'BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE',
  'APP3-W01B :: whole checkpoint, post-G06': 'BLOCKED_BY_APP3-W01A_AND_APP3-G07',
  'APP3-B02 :: whole checkpoint, post-G06': 'BLOCKED_BY_APP3-W01A_AND_APP3-B01N',
  'APP3-B03 :: whole checkpoint, post-G06':
    'BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP',
  'APP3-B06 :: whole checkpoint, post-G06':
    'BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP',
  'APP3-B01 :: whole checkpoint, post-G06': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G04 :: whole checkpoint, post-G06': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-DB01 :: whole checkpoint, post-G06': 'COMPLETE — REVIEW_ACCEPTED',
});

/** The twelve rulings, each identified in the register row. */
const RULINGS = Object.freeze([
  'PO-01',
  'PO-02',
  'PO-03',
  'PO-04',
  'PO-05',
  'PO-06',
  'PO-07',
  'PO-08',
  'PO-09',
  'PO-10',
  'PO-11',
  'PO-12',
]);

const ROOT_SCRIPT_COUNT = 30;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** The body of one `### x.y.z ` section, up to the next heading of any depth. */
export function sectionBody(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n#{2,4} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| \`Key\` | \`Value\` |` rows of the §6.16.1 fact table, as a map. */
export function factTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.16.1 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** `| \`ID\` | portion | \`STATUS\` |` rows of §6.16.3, keyed `id :: portion`. */
export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.16.3 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [`${m[1]} :: ${m[2]}`, m[3]]),
  );
}

/** 1, 2 — the decision exists exactly once, is LOCKED and carries every ruling. */
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
}

/**
 * 19, 20 — the authority stays authority.
 *
 * A gate that quietly grew an implementation would be a checkpoint wearing a
 * gate's name, so the *absence* is asserted as hard as any presence: no handler
 * for the new event, no producer append, and no profile column anywhere.
 */
function checkNoImplementation(rootDir, fail) {
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

  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    const shown = file.slice(rootDir.length + 1);
    if (source.includes('asset.normalization.requested')) {
      fail(`${shown} implements the normalization event; APP3-G06 is authority only`);
    }
    if (/NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE/.test(source)) {
      fail(`${shown} implements the stale-association outcome before W01A`);
    }
  }

  // No profile column, and no new derivative kind, may be authorized here.
  const derivatives = read(rootDir, 'derivativeSchema') ?? '';
  for (const forbidden of [
    'processing_profile',
    'editor_profile',
    'studio_profile',
    'delivery_profile',
  ]) {
    if (derivatives.includes(forbidden)) {
      fail(`${CANONICAL_FILES.derivativeSchema}: a persisted profile column "${forbidden}" exists`);
    }
  }
  for (const forbidden of [
    'EDITOR_SAFE',
    'STUDIO_PREVIEW',
    'SESSION_PREVIEW',
    'TEMPLATE_PREVIEW',
  ]) {
    if (derivatives.includes(forbidden)) {
      fail(`${CANONICAL_FILES.derivativeSchema}: derivative kind "${forbidden}" was added`);
    }
  }
}

/**
 * The architectural premise the ruling rests on.
 *
 * PO-01 claims a new event type costs no migration. That is only true while
 * `event_type` carries no CHECK: if a later change closed that set, the ruling
 * would be describing a database that no longer exists.
 */
function checkArchitecturePremise(rootDir, fail) {
  const outbox = read(rootDir, 'outboxSchema') ?? '';
  if (/check\([^)]*event_type/.test(outbox)) {
    fail(`${CANONICAL_FILES.outboxSchema}: event_type gained a CHECK; a new event now needs DDL`);
  }
  // The three association identities PO-02 names must exist as real keys.
  for (const [key, constraint] of [
    ['templateAssets', 'pk_design_template_assets'],
    ['sessionAssets', 'pk_design_session_assets'],
    ['productSides', 'pk_product_sides'],
  ]) {
    if (!(read(rootDir, key) ?? '').includes(constraint)) {
      fail(`${CANONICAL_FILES[key]}: ${constraint} is gone; associationRef is unrepresentable`);
    }
  }
}

/** 21, 23 — the platform follow-up stays open and no root script was added. */
function checkGovernance(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  if (
    !/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT/.test(
      phase,
    )
  ) {
    fail(`${CANONICAL_FILES.phase}: the platform Zod/OpenAPI follow-up is not recorded as open`);
  }
  if (/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01\s*=\s*(COMPLETE|CLOSED)/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the platform Zod/OpenAPI follow-up was closed here`);
  }
  if (!/FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 BLOCKED_BY = APP3-W01A_AND_APP3-B01N/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the public-media-dimensions blocker was not corrected`);
  }

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
  for (const command of ['CMD-CHECK-APP3-G06', 'CMD-TEST-APP3-G06']) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.commandIndex} does not index ${command}`);
  }
}

export function checkApp3G06(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const phase = read(rootDir, 'phase');
  const register = read(rootDir, 'register');
  if (phase === undefined || register === undefined) {
    fail('a canonical authority document is missing');
    return failures;
  }

  checkDecision(register, fail);
  checkTable(factTable(phase), EXPECTED_FACTS, 'machine-checked normalization fact', fail);
  checkTable(dependencyTable(phase), EXPECTED_DEPENDENCIES, 'dependency row for', fail);
  checkNormalizationEvents(
    {
      phase,
      register,
      security: read(rootDir, 'security') ?? '',
      nfr: read(rootDir, 'nfr') ?? '',
      audit: read(rootDir, 'audit') ?? '',
      files: CANONICAL_FILES,
    },
    fail,
  );
  checkArchitecturePremise(rootDir, fail);
  checkNoImplementation(rootDir, fail);
  checkGovernance(rootDir, fail);

  // 22 — B01 chains P02 → G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01, so one
  // call asserts the whole accepted authority this replan sits on top of.
  for (const violation of checkApp3B01(rootDir)) fail(`APP3-B01 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3G06(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g06 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g06 — APP3-G06 normalization dispatch authority locked (${DECISION_ID}; ` +
      `${String(Object.keys(EXPECTED_FACTS).length)} facts, ` +
      `${String(Object.keys(EXPECTED_DEPENDENCIES).length)} dependency rows): one new event ` +
      'asset.normalization.requested on the existing Outbox and worker registry with no second ' +
      'queue, scheduler, sweep or migration; the payload names the association and never the ' +
      'profile, which the worker re-derives at claim time; the producer appends in the ' +
      'association transaction; W01 is replanned into raster-only W01A plus Template-SVG W01B ' +
      'behind sanitizer authority G07, so SVG stays authorized but unavailable; B02 is blocked ' +
      'by W01A + B01N rather than B06; no profile column, no derivative kind, and no API or ' +
      'worker implementation exists',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

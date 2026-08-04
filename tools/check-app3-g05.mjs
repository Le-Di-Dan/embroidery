#!/usr/bin/env node
/**
 * `APP3-G05` — geometry coordinate, transform and bounds authority (`IMP-D045`).
 *
 * This gate guards a decision that the system cannot otherwise detect changing.
 * A v1 Design Document stores `x`, `y`, `rotationDeg`, `scaleX`, `scaleY` and
 * **no marker for how to interpret them**. Move the pivot from box centre to
 * corner, or reverse the composition order, and every stored design silently
 * relocates while its SHA-256 stays valid — the hash is over the bytes, not over
 * the interpretation. `ADR-DB1-012` binds approvals to that hash, so the one
 * mechanism that normally catches a semantic change is structurally blind here.
 * PO-12 makes such a change a schema-semantic event; this gate is what notices
 * if someone tries to make it quietly.
 *
 * It owns the bounds, containment, scale-authority, placement-mode and
 * integrity halves; `check-app3-g05-transform.mjs` owns the coordinate,
 * transform, matrix and group halves.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-g05.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sectionBody, tableRows } from './check-app3-g02.mjs';
import { checkApp3P01 } from './check-app3-p01.mjs';
import { checkTransformAuthority, collapse } from './check-app3-g05-transform.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  engine: 'packages/design-engine/src/index.ts',
});

export const DECISION_ID = 'IMP-D045';

export const FACTS_HEADING = '### 6.11.1 ';
export const RULINGS_HEADING = '### 6.11.2 ';

export const RULINGS = Object.freeze(
  Array.from({ length: 12 }, (_unused, index) => `PO-${String(index + 1).padStart(2, '0')}`),
);

/** Bounds, containment, scale, placement-mode and integrity facts. */
export const GEOMETRY_FACTS = Object.freeze({
  'Decision id': 'IMP-D045',

  // PO-08 — the bounds strategy, named so nobody can call it path-accurate.
  'Bounds strategy': 'CONSERVATIVE_TRANSFORMED_AABB',
  'Box element bounds': 'TRANSFORM_FOUR_LOCAL_CORNERS_THEN_AXIS_ALIGN',
  'Tight rotated ellipse aabb': 'NOT_APP3_V1',
  'Path smoothing or bezier geometry': 'FORBIDDEN',
  'Group painted geometry': 'NONE',
  'Group bounds': 'UNION_OF_DESCENDANT_DRAWABLE_AABB',
  'Document bounds': 'UNION_OF_ALL_DRAWABLE_AABB',
  'Hidden locked element geometry': 'COUNTS',
  'Z order effect on bounds': 'NONE',

  /*
   * PO-08 as corrected by `APP3-G05-C1`.
   *
   * The delivered ruling expanded only line and freehand, while P01 also gives
   * rectangle and ellipse a `strokeWidthPx` — so a stroked rectangle could paint
   * outside the "conservative" bounds and still pass containment. The strategy
   * was optimistic for two of the four stroked kinds, which is exactly the
   * failure it is named to prevent.
   */
  'Stroked kinds': 'rectangle ellipse line freehand',
  'Unstroked kinds': 'text image',
  'Text image stroke expansion': 'NONE',
  'Stroke alignment': 'CENTRED_ON_LOCAL_PATH',
  'Stroke expansion': 'strokeWidthPx / 2',
  'Zero stroke expansion': 'NONE',
  'Stroke in bounds containment and physical size': 'INCLUDED',
  'Stroke as renderer decoration': 'FORBIDDEN',
  'Stroke subtracted from width height': 'FORBIDDEN',
  'Rectangle local path': 'BOUNDARY_OF_DECLARED_BOX',
  'Rectangle line join': 'MITER',
  'Rectangle miter limit': '4',
  'Ellipse local path': 'INSCRIBED_IN_DECLARED_BOX',
  'Ellipse bounds': 'DECLARED_BOX_PLUS_HALF_STROKE_TRANSFORMED_AABB',
  // v1 stores no endpoints, so the path had to be ruled or no two renderers
  // were obliged to draw the same segment.
  'Line local path': '(0,0) to (width,height)',
  'Line segment shape': 'STRAIGHT',
  'Forbidden line paths':
    'HORIZONTAL_CENTRELINE VERTICAL_CENTRELINE RENDERER_PATH RENDERER_CHOSEN_DIAGONAL UNSTORED_ENDPOINTS',
  'Line cap': 'ROUND',
  'Line join': 'ROUND',
  'Freehand point frame': 'ELEMENT_LOCAL',
  'Freehand path': 'ORDERED_POLYLINE_STRAIGHT_SEGMENTS',
  'Freehand cap': 'ROUND',
  'Freehand join': 'ROUND',
  'Freehand single point geometry': 'ROUND_DOT_RADIUS_HALF_STROKE',
  'Freehand smoothing simplification': 'FORBIDDEN',
  // Expanding after the transform would ignore scale and rotation entirely.
  'Envelope transform order': 'EXPAND_LOCAL_THEN_TRANSFORM_THEN_AXIS_ALIGN',
  'Document space stroke addition': 'FORBIDDEN',
  'Cap join as document field': 'FORBIDDEN_VERSION_LEVEL_CONSTANT',
  'Stroke semantics change class': 'SCHEMA_SEMANTIC_UNDER_PO_12',

  // PO-09 — containment is blocking, boundary-inclusive and never mutating.
  'Containment strategy': 'FULL_TRANSFORMED_AABB_INSIDE_AREA',
  'Containment boundary equality': 'VALID',
  'Containment overhang': 'INVALID',
  'Containment enforcement': 'BLOCKING',
  'Containment mutation': 'NONE',

  // PO-10 — one conversion authority, never a DPI guess or an area ratio.
  'Px per mm authority': 'product_sides.px_per_mm',
  'Area derived scale': 'FORBIDDEN',
  'Dpi assumption': 'FORBIDDEN',
  'Area max mm role': 'PHYSICAL_LIMIT_NOT_CONVERSION',
  'Product side scale consistency': 'BOTH_AXES_MUST_EQUAL_PX_PER_MM',
  'Inconsistent axis resolution': 'TYPED_MISMATCH_NEVER_AVERAGED',

  // PO-11 — retirement is not deletion.
  'Placement modes': 'NEW_EDITING HISTORICAL_RENDER',
  'New editing retired placement': 'NOT_SELECTABLE',
  'Historical render retired placement': 'VALID',
  'Retirement as deletion': 'NEVER',
  'Silent supersede of historical document': 'FORBIDDEN',

  // PO-12 — the semantics are part of schemaVersion 1.
  'Geometry semantics binding': 'SCHEMA_VERSION_1',
  'Semantic change requirement': 'NEW_DECISION_SCHEMA_VERSION_AND_MIGRATION',
  'Silent semantic change': 'FORBIDDEN',
  'Geometry engine compatibility record': 'REQUIRED_IN_APPROVAL_AND_RENDERING_EVIDENCE',
  G05_DB_CONTRIBUTION: 'NONE',
  // Deliberately not "Quantization authority": §6.10.1 already owns that key
  // for P01, and two tables sharing a key is how a gate ends up asserting the
  // wrong row.
  'Geometry quantization authority': 'REUSES_P01_SCALE_10000',
});

/** Prose the ruling section must still carry, matched whitespace-collapsed. */
export const GEOMETRY_CLAIMS = Object.freeze([
  ['containment is blocking', 'Production containment is **blocking**'],
  ['boundary equality is valid', 'Touching the boundary exactly is valid'],
  ['any overhang is invalid', '**any** overhang is invalid'],
  // APP3-G05-C1
  ['the stroke is drawable geometry', '**The stroke is drawable geometry.**'],
  ['stroke is centred on the local path', 'centred on the local path'],
  ['a fill does not exempt a stroke', 'never ignored because the element also has'],
  ['the ruled v1 line path', 'straight segment from `(0,0)` to `(width,height)`'],
  ['expand-then-transform order', 'transform **all four corners of that envelope**'],
  [
    'no post-transform half-stroke',
    'adding an unscaled document-space half-stroke afterwards is forbidden',
  ],
  ['cap/join are version-level constants', 'version-level constants, not document fields'],
  ['containment is stroke-aware', 'part of its ruled stroke envelope overhangs'],
  ['physical size uses the same bounds', 'Physical-size validation uses the same stroke-aware'],
  [
    'write APIs treat out-of-bounds as failure',
    'must treat an out-of-bounds finding as a validation failure',
  ],
  [
    'the conservative trade-off is accepted deliberately',
    'may reject a path whose visible pixels fit',
  ],
  ['product_sides.px_per_mm is the sole source', 'The sole px↔mm source is'],
  ['area maxima are limits, not conversion', 'physical limits, not conversion authority'],
  ['axes are never averaged', 'never averaged'],
  ['the two placement modes', '`NEW_EDITING` versus `HISTORICAL_RENDER`'],
  ['retirement is not deletion', 'never treated as deletion'],
  ['the semantics belong to schemaVersion 1', 'semantic interpretation of'],
  ['a semantic change cannot ship as a refactor', 'cannot ship as an internal refactor'],
]);

function read(rootDir, relative) {
  const path = join(rootDir, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** 1 — the decision exists exactly once as a register row, and is LOCKED. */
function checkDecision(register, fail) {
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length !== 1) {
    fail(
      `the decision register holds ${String(rows.length)} ${DECISION_ID} rows; expected exactly 1`,
    );
    return;
  }
  const row = rows[0] ?? '';
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${DECISION_ID} is recorded but not LOCKED`);
  }
  for (const ruling of RULINGS) {
    if (!row.includes(`(${ruling})`)) fail(`${DECISION_ID} does not record ruling ${ruling}`);
  }
}

/** 2 — every ruling is present in the bounded phase section too. */
function checkRulings(rulings, fail) {
  const prose = collapse(rulings);
  for (const ruling of RULINGS) {
    if (!prose.includes(`**${ruling} —`)) fail(`§6.11.2 does not record ruling ${ruling}`);
  }
  for (const [label, claim] of GEOMETRY_CLAIMS) {
    if (!prose.includes(collapse(claim))) fail(`§6.11.2 no longer states ${label}`);
  }
}

/** 12–17 — bounds, containment, scale, placement modes and integrity. */
function checkGeometryFacts(rows, fail) {
  for (const [key, expected] of Object.entries(GEOMETRY_FACTS)) {
    const actual = rows.get(key);
    if (actual === undefined) {
      fail(`§6.11.1 records no "${key}"`);
    } else if (actual !== expected) {
      fail(`§6.11.1 "${key}" is "${actual}", expected "${expected}"`);
    }
  }
}

/**
 * 18, 19 — G05 authorises geometry; it does not implement any.
 *
 * Exactly **two** worlds are consistent, and this accepts only those: before
 * `APP3-P02` the engine is an empty stub and the phase plan blocks it; after
 * P02 the stub is legitimately gone and the plan records it delivered. A gate
 * frozen to "the stub must stay empty" would have to be deleted the day P02
 * shipped, which is how an authority check quietly stops being run — the defect
 * `APP3-G04` was rebuilt to avoid and `APP3-F01` hit again at `APP3-P01`.
 */
function checkNoImplementation(rootDir, phase, fail) {
  const engine = read(rootDir, CANONICAL_FILES.engine);
  const delivered = /APP3-P02 = COMPLETE/.test(phase);
  if (engine === undefined) {
    fail(`${CANONICAL_FILES.engine} is missing`);
  } else if (!/export\s*\{\s*\}/.test(engine) && !delivered) {
    fail(
      `${CANONICAL_FILES.engine} is no longer an empty stub while the phase plan still blocks APP3-P02`,
    );
  } else if (/export\s*\{\s*\}/.test(engine) && delivered) {
    fail('the phase plan records APP3-P02 as delivered, but the engine is still a stub');
  }
  // Before P02 the plan must block it — on G05 review acceptance, or after
  // `APP3-G05-C1` on the correction review that supersedes it.
  if (!delivered && !/APP3-P02 = BLOCKED_BY_APP3-G05/.test(phase)) {
    fail('the phase plan does not block APP3-P02 on APP3-G05 review');
  }
  // The cause survives P02 either way: it is why IMP-D045 exists.
  if (!phase.includes('GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT')) {
    fail('the phase plan does not record the cause of the failed APP3-P02 first attempt');
  }
  // The spike is why the stop happened; it must stay classified as research.
  if (!collapse(phase).includes('COMPARATIVE_RESEARCH_NOT_PRODUCTION_AUTHORITY')) {
    fail('the phase plan no longer classifies the APP0-R01 adapters as research evidence');
  }
}

export function checkApp3G05(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const phase = read(rootDir, CANONICAL_FILES.phase);
  const register = read(rootDir, CANONICAL_FILES.register);
  if (phase === undefined || register === undefined) {
    fail('the APP3 phase plan or the decision register is missing');
    return failures;
  }

  const rows = tableRows(sectionBody(phase, FACTS_HEADING));
  const rulings = sectionBody(phase, RULINGS_HEADING);
  if (rows.size === 0) fail(`${FACTS_HEADING.trim()} holds no locked facts`);

  checkDecision(register, fail);
  checkRulings(rulings, fail);
  checkGeometryFacts(rows, fail);
  checkTransformAuthority(rows, rulings, fail);
  checkNoImplementation(rootDir, phase, fail);

  // 20 — the authority G05 builds on. P01 chains F01 and DB01, which chain
  // G04 → G03 → G02 → G01, so one call asserts the whole accepted entry set.
  for (const violation of checkApp3P01(rootDir)) fail(`APP3-P01 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3G05(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g05 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-g05 — IMP-D045 is LOCKED with twelve rulings: top-left origin with y down and ' +
      'degrees clockwise, persisted x/y as the untransformed local-box top-left in the parent ' +
      'frame, rotation and scale sharing the local-box centre with scale applied first, ' +
      "column-vector p' = M x p and an exact local matrix order, group-local child coordinates " +
      'composed parent-outermost with the group box as pivot but never as bounds, ' +
      'CONSERVATIVE_TRANSFORMED_AABB bounds whose local envelope carries the half-stroke of every ' +
      'stroked kind (rectangle miter/4; line and freehand round cap and join; the v1 line path ' +
      'locked to (0,0)-(width,height)) and is expanded before it is transformed, blocking ' +
      'boundary-inclusive stroke-aware containment that never clamps, product_sides.px_per_mm as ' +
      'the sole conversion authority with no DPI or area-derived scale, NEW_EDITING versus ' +
      'HISTORICAL_RENDER placement modes, and a schema-semantic change bar on every one of them; ' +
      'no geometry is implemented and APP3-P02 stays blocked on review',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

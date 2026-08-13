#!/usr/bin/env node
/**
 * `APP3-S02` — the production SVG stage, the renderer adapter and single-element
 * selection.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * stage that resolves its own matrix and agrees with the engine on every
 * fixture anyone wrote. A paint order quietly reversed, invisible until two
 * elements overlap. A selection outline measured from `getBoundingClientRect`,
 * correct at one zoom level and wrong at every other. An `<svg>` beside another
 * `<svg>` — two renderers, both working. A `no-store` background whose object
 * URL is never revoked. An image element that falls back to the *Template*
 * asset route because a cloned Session happens to know a Template slug. A
 * pointer handler added "for later" that turns a drawing surface into an editor
 * nobody reviewed. Every one of those ships a working screen.
 *
 * This module rules on the predecessors, the design approval and the artifacts
 * that must not move; `check-app3-s02-runtime.mjs` rules on what the stage does.
 *
 * This gate does not read the completion report. A report is a claim; every
 * fact below is recomputed from the repository.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S02_STATUS_LINES,
  acceptedSurface,
  isS02Delivered,
  isS03Delivered,
  isS05Delivered,
  isS06Delivered,
  isS04Delivered,
  isS08Delivered,
  isS10Delivered,
  isS09Delivered,
  isS07Delivered,
  isB06CDelivered,
  S06_FILES,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  S02_DESIGN_ROWS,
  STOREFRONT,
  TABLET_REFERENCE_OWNER,
  TABLET_REFERENCE_ROW,
  collect,
  read,
  featureCode,
  s02FeatureCode,
} from './check-app3-s02.sources.mjs';
import {
  checkDependencies,
  checkGeometryAuthority,
  checkMedia,
  checkNonScope,
  checkRenderer,
  checkSelection,
} from './check-app3-s02-runtime.mjs';

export { REPO_ROOT, CANONICAL_FILES, S02_DESIGN_ROWS, LATER_STUDIO_ROWS };
export {
  checkDependencies,
  checkGeometryAuthority,
  checkMedia,
  checkNonScope,
  checkRenderer,
  checkSelection,
};

/** The predecessors this stage is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of [
    'APP3-D01',
    'APP3-D01-C1',
    'APP3-B02',
    'APP3-B05A',
    'APP3-B07',
    'APP3-P01',
    'APP3-P02',
    'APP3-S01',
    'APP3-S01-C1',
  ]) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S02_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S02 is not recorded under a legitimate status`);
  }
  if (isS02Delivered(rootDir)) {
    for (const line of [
      'APP3-S02 BACKEND_CHANGE = NONE',
      'APP3-S02 MIGRATION = NONE',
      'APP3-S02 IMAGE_MEDIA_MODE = DEFERRED_TO_S06_B06C',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // S03 is the next checkpoint, not part of this one — and B06C is not S02's
  // to deliver merely because an image element cannot show its bytes yet.
  // Once a later checkpoint has legitimately shipped, its status line stops
  // being evidence about this one. What still proves S02 did not implement
  // transforms is its own runtime half: the pointer gestures are refused in
  // every file S02 owns.
  const later = [
    ...(isB06CDelivered(rootDir) ? [] : ['APP3-B06C']),
    ...(isS03Delivered(rootDir) ? [] : ['APP3-S03']),
  ];
  // `APP3-B06C` has shipped, so its status line is no longer evidence about this
  // checkpoint — the same reasoning the S03 exclusion above already applies. What
  // replaces it is stronger and world-independent: **S02's own files** must not
  // call the delivery operation, whichever checkpoints exist around it. Scoped to
  // those files since `APP3-S06`, which is the checkpoint that legitimately calls
  // it; before S06 the scope is the whole feature and the ban is unchanged.
  const s02Scope = isS06Delivered(rootDir)
    ? s02FeatureCode(rootDir, S06_FILES)
    : featureCode(rootDir);
  if (/publicDesignSessionAssetGet|editor-preview/.test(s02Scope)) {
    fail(`${CANONICAL_FILES.phase}: S02 source reaches the APP3-B06C delivery operation`);
  }

  for (const id of later) {
    if (new RegExp(`\\n${id} = COMPLETE`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${id} is recorded complete; S02 does not implement it`);
    }
  }
}

function rowStatus(registry, id) {
  const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
  return line === undefined ? null : (line.split('|')[8] ?? '').trim();
}

/** Scoped design approval, asserted in both directions. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const delivered = isS02Delivered(rootDir);

  for (const [id, node] of Object.entries(S02_DESIGN_ROWS)) {
    const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
    if (line === undefined) {
      fail(`${CANONICAL_FILES.registry}: ${id} is not registered`);
      continue;
    }
    if (!line.includes(`| ${node} |`)) {
      fail(`${CANONICAL_FILES.registry}: ${id} does not carry node ${node}`);
    }
    const expected = delivered ? 'APPROVED_FOR_IMPLEMENTATION' : 'REVIEW_REQUIRED';
    const actual = rowStatus(registry, id);
    if (actual !== expected) {
      fail(`${CANONICAL_FILES.registry}: ${id} is ${String(actual)}, expected ${expected}`);
    }
    if (delivered && !line.includes('APP3-S02')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S02 approval evidence`);
    }
  }

  /*
   * The half that makes the approval *scoped*: a blanket Studio approval must
   * fail this gate rather than pass it.
   *
   * World-aware on exactly the rows whose own checkpoint has opened. Each of
   * these stands here for the capability that owns it, so once that checkpoint
   * ships the row stops proving anything and the remaining rows carry the
   * assertion. Layers, image, undo, watermark, autosave and mobile are
   * untouched, which is what keeps "scoped" a real claim rather than a ratchet
   * that loosens on every landing.
   */
  const opened = new Set([
    ...(isS07Delivered(rootDir) ? ['FIG-STUDIO-ZOOM-DESKTOP-FIT'] : []),
    ...(isS03Delivered(rootDir) ? ['FIG-STUDIO-TRANSFORM-DESKTOP-MOVE'] : []),
    ...(isS05Delivered(rootDir) ? ['FIG-STUDIO-TEXT-DESKTOP-EDITING'] : []),
    ...(isS06Delivered(rootDir) ? ['FIG-STUDIO-IMAGE-DESKTOP-UPLOADING'] : []),
    ...(isS04Delivered(rootDir) ? ['FIG-STUDIO-LAYERS-DESKTOP-DEFAULT'] : []),
    ...(isS09Delivered(rootDir) ? ['FIG-STUDIO-WATERMARK-DESKTOP-LIGHT'] : []),
    ...(isS08Delivered(rootDir) ? ['FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY'] : []),
    ...(isS10Delivered(rootDir) ? ['FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED'] : []),
  ]);
  for (const id of LATER_STUDIO_ROWS.filter((row) => !opened.has(row))) {
    if (rowStatus(registry, id) !== 'REVIEW_REQUIRED') {
      fail(`${CANONICAL_FILES.registry}: ${id} belongs to a checkpoint that has not opened`);
    }
  }

  // The 1024 frame is a responsive reference across S02–S11. Re-attributing it
  // to S02 would turn a reference into a licence for every capability on it.
  const tablet = registry.split('\n').find((row) => row.startsWith(`| ${TABLET_REFERENCE_ROW} |`));
  if (tablet === undefined) {
    fail(`${CANONICAL_FILES.registry}: ${TABLET_REFERENCE_ROW} is not registered`);
  } else if (!tablet.includes(`| ${TABLET_REFERENCE_OWNER} |`)) {
    fail(
      `${CANONICAL_FILES.registry}: ${TABLET_REFERENCE_ROW} no longer belongs to ${TABLET_REFERENCE_OWNER}`,
    );
  }
}

/** The artifacts a frontend checkpoint must leave exactly where it found them. */
export function checkImmutability(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(raw);
  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (total, methods) => total + Object.keys(methods).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  if (paths !== surface.paths || operations !== surface.operations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${paths}/${operations}, expected ${surface.paths}/${surface.operations}`,
    );
  }
  if (surface.schemas !== undefined && schemas !== surface.schemas) {
    fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${surface.schemas}`);
  }
  for (const key of ['openapi', 'generatedClient']) {
    if ((read(rootDir, key) ?? '').includes('APP3-S02')) {
      fail(`${CANONICAL_FILES[key]}: carries an APP3-S02 edit`);
    }
  }

  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${count} migrations, expected ${EXPECTED_MIGRATIONS}`);
  }

  const scripts = Object.keys(
    JSON.parse(read(rootDir, 'rootPackage') ?? '{}').scripts ?? {},
  ).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(`${CANONICAL_FILES.rootPackage}: ${scripts} root scripts, expected ${ROOT_SCRIPTS}`);
  }
}

/** The scoped commands, each bound to the command it names. */
export function checkCommandIndex(rootDir, fail) {
  const rows = (read(rootDir, 'index') ?? '').split('\n');
  for (const [command, invocation] of [
    ['CMD-CHECK-APP3-S02', 'node tools/check-app3-s02.mjs'],
    ['CMD-TEST-APP3-S02', 'node --test tools/check-app3-s02.test.mjs'],
    ['CMD-TEST-APP3-S02-STOREFRONT', '--testPathPatterns=studio-stage'],
    ['CMD-BENCH-APP3-S02-EDITOR', '--testPathPatterns=studio-stage-scale'],
  ]) {
    if (!rows.some((row) => row.includes(`\`${command}\` |`) && row.includes(invocation))) {
      fail(`${CANONICAL_FILES.index}: ${command} is not registered against its command`);
    }
  }
}

/** Split by responsibility, so a limit is never met by slicing a file in half. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) fail(`${relative(rootDir, path)}: ${lines} lines, over the 400-line maximum`);
  }
  for (const path of collect(join(rootDir, STOREFRONT, 'test'), /studio.*\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 600) {
      fail(`${relative(rootDir, path)}: ${lines} lines, over the 600-line test maximum`);
    }
  }
}

export function checkApp3S02(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const governance = [
    checkPredecessors,
    checkDesignApproval,
    checkImmutability,
    checkCommandIndex,
    checkFileSizes,
  ];
  // The runtime rules read the stage's own source, so they only apply in the
  // world where that source exists.
  const runtime = isS02Delivered(rootDir)
    ? [
        checkRenderer,
        checkGeometryAuthority,
        checkSelection,
        checkMedia,
        checkNonScope,
        checkDependencies,
      ]
    : [];
  for (const step of [...governance, ...runtime]) step(rootDir, fail);
  return failures;
}

function main() {
  const failures = checkApp3S02();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-s02 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-s02 — exactly one production Studio renderer, native SVG rendered by React with no rendering or interaction engine in the manifest or the source, on exactly the three approved section-06 design rows with every later Studio capability row still unapproved and the 1024 frame still a D01-C1 reference: a renderer adapter that validates the document through APP3-P01 and takes every matrix, bound and font from APP3-P02 and the controlled registry, a stage whose viewBox is the document placement canvas and whose paint order is the element array with no sort or reverse, no geometry taken from the DOM and none reimplemented locally, single-element selection held as one serializable id in one store that can hold no DOM node, blob, session identity or later-checkpoint state and is never persisted or serialized, the one contextual Side background addressed by Product slug and Side code with its object URL revoked in effect cleanup and no placeholderData over a no-store blob, no Session asset route, no B05A shortcut from an open Session, no autosave, no transform mutation, and no layer, text, upload, undo or watermark capability — with the pointer gestures and the one element-size measurement a viewport needs confined to the files APP3-S07 introduced and refused everywhere else, and an OpenAPI artifact, generated client, migration count and root-script count all unchanged.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

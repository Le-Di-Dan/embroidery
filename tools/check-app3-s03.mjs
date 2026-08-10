#!/usr/bin/env node
/**
 * `APP3-S03` — Studio transforms, DOM handles and the live physical read-out.
 *
 * This is the first checkpoint that **changes** a Design Document, and the
 * rules worth a machine are the ones that stay green while being wrong: a
 * resize that writes `width` and silently fails to resize a `freehand` element;
 * a grouped child moved by adding a raw document delta to `x`/`y`, which tracks
 * the pointer exactly until the group is rotated; a candidate validated before
 * quantization and committed after it, one ten-thousandth of a pixel outside
 * the safe area; a clamp that draws a design which fits and is not the one the
 * customer made; a rotation about the transformed-AABB centre, correct for a
 * square and drifting for everything else.
 *
 * This module rules on the predecessors, the design approval and the artifacts
 * that must not move; `check-app3-s03-runtime.mjs` rules on what a transform
 * does. Neither reads the completion report, and neither is the benchmark: a
 * structural gate cannot measure a millisecond, so both are required.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S03_STATUS_LINES, acceptedSurface, isS03Delivered } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  S03_DESIGN_ROWS,
  SCENE_SIZES,
  STOREFRONT,
  TABLET_REFERENCE_OWNER,
  TABLET_REFERENCE_ROW,
  collect,
  read,
} from './check-app3-s03.sources.mjs';
import {
  checkChrome,
  checkFoundation,
  checkGeometryAuthority,
  checkNonScope,
  checkPredecessorGates,
  checkValidation,
  checkWorkingDocument,
} from './check-app3-s03-runtime.mjs';

export { REPO_ROOT, CANONICAL_FILES, S03_DESIGN_ROWS, LATER_STUDIO_ROWS };
export {
  checkChrome,
  checkFoundation,
  checkGeometryAuthority,
  checkNonScope,
  checkPredecessorGates,
  checkValidation,
  checkWorkingDocument,
};

/** The predecessors a transform is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of ['APP3-D01', 'APP3-D01-C1', 'APP3-P01', 'APP3-P02', 'APP3-S02', 'APP3-S07']) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S03_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S03 is not recorded under a legitimate status`);
  }
  if (isS03Delivered(rootDir)) {
    for (const line of [
      'APP3-S03 BACKEND_CHANGE = NONE',
      'APP3-S03 MIGRATION = NONE',
      // The two facts a reader cannot recompute from the source: which v1
      // representation a resize persists, and that flip was audited and found
      // unauthorised rather than forgotten.
      'APP3-S03 RESIZE_PERSISTENCE = SCALE_ABOUT_THE_LOCAL_BOX_CENTRE',
      'APP3-S03 FLIP = NOT_AUTHORIZED_BY_CURRENT_S03_DESIGN',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // S11 needs S03 **and** S07, so S03 delivering does not make it ready.
  for (const later of ['APP3-S11', 'APP3-S04', 'APP3-S05', 'APP3-B06C']) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${later} is recorded complete; S03 does not implement it`);
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
  const delivered = isS03Delivered(rootDir);

  for (const [id, node] of Object.entries(S03_DESIGN_ROWS)) {
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
    if (delivered && !line.includes('APP3-S03')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S03 approval evidence`);
    }
  }

  // Every remaining Studio capability belongs to a checkpoint that has not
  // opened, and a blanket approval must fail this gate rather than pass it.
  for (const id of LATER_STUDIO_ROWS) {
    if (rowStatus(registry, id) !== 'REVIEW_REQUIRED') {
      fail(`${CANONICAL_FILES.registry}: ${id} belongs to a checkpoint that has not opened`);
    }
  }

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
    if ((read(rootDir, key) ?? '').includes('APP3-S03')) {
      fail(`${CANONICAL_FILES[key]}: carries an APP3-S03 edit`);
    }
  }

  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${String(count)} migrations, expected ${String(EXPECTED_MIGRATIONS)}`);
  }

  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  if (Object.keys(manifest.scripts ?? {}).length !== ROOT_SCRIPTS) {
    fail(`package.json: root scripts moved, expected ${String(ROOT_SCRIPTS)}`);
  }

  // The curated boundary is unchanged: S03 consumes no operation at all.
  const curated = read(rootDir, 'curatedClient') ?? '';
  for (const withheld of ['publicDesignSessionAutosave', 'publicDesignSessionAssetCreate']) {
    if (curated.split('\n').some((line) => line.trim().startsWith(withheld))) {
      fail(`${CANONICAL_FILES.curatedClient}: ${withheld} crossed the boundary without a consumer`);
    }
  }
  const storefront = JSON.parse(read(rootDir, 'storefrontPackage') ?? '{}');
  for (const invented of ['@embroidery/design-transform', '@embroidery/studio-transform']) {
    if (Object.keys(storefront.dependencies ?? {}).includes(invented)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: depends on a package S03 invented (${invented})`);
    }
  }
}

/** Every command this checkpoint adds is discoverable, and none is a root script. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  const commands = Object.freeze({
    'CMD-CHECK-APP3-S03': 'node tools/check-app3-s03.mjs',
    'CMD-TEST-APP3-S03': 'node --test tools/check-app3-s03.test.mjs',
    'CMD-TEST-APP3-S03-STOREFRONT': '--testPathPatterns=studio-transform',
    'CMD-BENCH-APP3-S03-TRANSFORMS': 'node tools/bench-app3-s03-transforms.mjs',
  });
  for (const [id, command] of Object.entries(commands)) {
    if (!index.includes(id)) fail(`${CANONICAL_FILES.index}: ${id} is not indexed`);
    if (!index.includes(command)) {
      fail(`${CANONICAL_FILES.index}: ${id} does not carry its command (${command})`);
    }
  }
  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  for (const script of Object.keys(manifest.scripts ?? {})) {
    if (script.includes('app3-s03')) {
      fail(`package.json: "${script}" is a checkpoint command and belongs in the scoped index`);
    }
  }

  // Both browsers and all three scene sizes. `M` is not optional here: a
  // benchmark that skipped the middle would not show whether cost scales.
  const benchmark = read(rootDir, 'benchmark') ?? '';
  if (benchmark === '') {
    fail(`${CANONICAL_FILES.benchmark}: missing`);
    return;
  }
  for (const browser of ['chromium', 'webkit']) {
    if (!benchmark.includes(browser)) {
      fail(`${CANONICAL_FILES.benchmark}: does not measure ${browser}`);
    }
  }
  // The sizes are declared by the fixtures the benchmark imports, so the pair
  // is what has to carry them — anchoring on one file would fail the moment the
  // constant legitimately moved to the other, which is the defect `APP3-B04A`
  // recorded about rules tied to a path.
  const scenes = `${benchmark}\n${read(rootDir, 'benchmarkFixtures') ?? ''}`;
  for (const [size, count] of Object.entries(SCENE_SIZES)) {
    if (!new RegExp(`${size}:\\s*${String(count)}`).test(scenes)) {
      fail(`${CANONICAL_FILES.benchmark}: does not measure the ${size} scene at ${String(count)}`);
    }
  }
  for (const gesture of ['move', 'resize', 'rotate']) {
    if (!benchmark.includes(gesture)) {
      fail(`${CANONICAL_FILES.benchmark}: does not measure ${gesture}`);
    }
  }
}

/** Source files stay inside the repository's limits. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, STOREFRONT, 'src/features/design-studio'), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${relative(rootDir, path).replaceAll('\\', '/')}: ${String(lines)} lines exceeds 400`);
    }
  }
}

export function checkApp3S03(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkImmutability(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);

  // The runtime rules read the transform's own source, so running them before
  // the checkpoint ships would be ruling on a capability that does not exist.
  if (isS03Delivered(rootDir)) {
    checkFoundation(rootDir, fail);
    checkWorkingDocument(rootDir, fail);
    checkGeometryAuthority(rootDir, fail);
    checkValidation(rootDir, fail);
    checkChrome(rootDir, fail);
    checkNonScope(rootDir, fail);
    checkPredecessorGates(rootDir, fail);
  }

  return failures;
}

const HEADLINE =
  'check:app3-s03 — Studio transforms over the unchanged APP3-S02 scene and the APP3-S07 viewport, on exactly the three approved section-07 design rows with every remaining Studio capability row still unapproved: one runtime-only working Design Document keyed by Session identity and revision, persisted nowhere and never re-initialized over a local edit; a move expressed in the parent frame through APP3-P02 inverse and transformVector rather than by adding a raw document delta; a resize persisted as scale about the untransformed local-box centre, never width or height; a rotation built on the starting angle about that same centre and never the transformed AABB; every candidate quantized through APP3-P01 and then measured by APP3-P02 for stroke-aware containment and physical size, with no clamp, snap, scale-down or warn-but-persist anywhere; eight frozen resize handles and a rotate affordance as DOM chrome placed on the engine effective matrix, counter-scaled against the viewport and sized to the shared 44 px minimum; a millimetre read-out from P02 bounds over the Product Side pxPerMm; no touch transform, no undo, no layer, no text property, no upload, no watermark and no autosave; no second matrix builder in the whole feature; and an OpenAPI artifact, generated client, curated boundary, migration count and root-script count all unchanged.';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkApp3S03();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.log(
    failures.length === 0 ? HEADLINE : `\ncheck:app3-s03 — ${String(failures.length)} failure(s)`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

#!/usr/bin/env node
/**
 * `APP3-S07` — the Studio viewport: zoom, pan, safe-area visibility and the
 * WebKit mitigation the rendering ADR left this checkpoint to make real.
 *
 * `ADR-APP0-001` measured one risk in the whole architecture and named its
 * owner: WebKit re-rasterises the entire SVG on every viewport scale change, at
 * 41 ms p95 against a 20 ms budget, versus 16.7 ms on Chromium. A viewport can
 * be built five ways that all look right and only one of which closes that. So
 * the rules here are on the shape of the code, not on a frame that happened to
 * render: a zoom that is an index into a frozen list rather than a multiplier,
 * one transform on one wrapper rather than a scale reaching every element, a
 * scene memoised on the document alone rather than rebuilt per step, and no
 * wheel handler anywhere to put the continuous path back in one line.
 *
 * This module rules on the predecessors, the design approval and the artifacts
 * that must not move; `check-app3-s07-runtime.mjs` rules on what the viewport
 * does.
 *
 * This gate does not read the completion report, and it is not the benchmark.
 * A report is a claim, every fact below is recomputed from the repository, and
 * a structural gate cannot measure a millisecond — both are required.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S07_STATUS_LINES,
  acceptedSurface,
  isS03Delivered,
  isS05Delivered,
  isS06Delivered,
  isS04Delivered,
  isS08Delivered,
  isS10Delivered,
  isS09Delivered,
  isS07Delivered,
  isB06CDelivered,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  S07_DESIGN_ROWS,
  STOREFRONT,
  TABLET_REFERENCE_OWNER,
  TABLET_REFERENCE_ROW,
  collect,
  read,
  featureCode,
  preS06Code,
} from './check-app3-s07.sources.mjs';
import {
  checkNonScope,
  checkPredecessorGate,
  checkSafeArea,
  checkSceneUntouched,
  checkViewportBoundary,
  checkViewportState,
  checkZoom,
} from './check-app3-s07-runtime.mjs';

export { REPO_ROOT, CANONICAL_FILES, S07_DESIGN_ROWS, LATER_STUDIO_ROWS };
export {
  checkNonScope,
  checkPredecessorGate,
  checkSafeArea,
  checkSceneUntouched,
  checkViewportBoundary,
  checkViewportState,
  checkZoom,
};

/** The predecessors this viewport is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of ['APP3-D01', 'APP3-D01-C1', 'APP3-B02', 'APP3-P01', 'APP3-P02', 'APP3-S02']) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S07_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S07 is not recorded under a legitimate status`);
  }
  if (isS07Delivered(rootDir)) {
    for (const line of [
      'APP3-S07 BACKEND_CHANGE = NONE',
      'APP3-S07 MIGRATION = NONE',
      'APP3-S07 WEBKIT_MITIGATION = DISCRETE_STEPS_ON_ONE_CSS_WRAPPER',
      'APP3-S07 ZOOM_LIMITS_DISCLOSED = ENGINEERING_RULING',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // S03 is the next checkpoint, not part of this one, and S11 is not made ready
  // by S07 alone — it needs S03 as well.
  // Once a later checkpoint has legitimately shipped, its status line stops
  // being evidence about this one. S11 stays listed: it needs S03 *and* S07,
  // so S03 delivering does not make it ready.
  const later = [
    'APP3-S11',
    ...(isB06CDelivered(rootDir) ? [] : ['APP3-B06C']),
    ...(isS03Delivered(rootDir) ? [] : ['APP3-S03']),
  ];
  // `APP3-B06C` has shipped, so its status line is no longer evidence about this
  // checkpoint — the same reasoning the S03 exclusion above already applies. What
  // replaces it is stronger and world-independent: S07 must not *call* the
  // delivery operation, whichever checkpoints exist around it.
  // Scoped to the files S07 owns since `APP3-S06`, the checkpoint that
  // legitimately calls it; before S06 the scope is the whole feature.
  const s07Scope = isS06Delivered(rootDir) ? preS06Code(rootDir) : featureCode(rootDir);
  if (/publicDesignSessionAssetGet|editor-preview/.test(s07Scope)) {
    fail(`${CANONICAL_FILES.phase}: S07 source reaches the APP3-B06C delivery operation`);
  }

  for (const id of later) {
    if (new RegExp(`\\n${id} = COMPLETE`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${id} is recorded complete; S07 does not implement it`);
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
  const delivered = isS07Delivered(rootDir);

  for (const [id, node] of Object.entries(S07_DESIGN_ROWS)) {
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
    if (delivered && !line.includes('APP3-S07')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S07 approval evidence`);
    }
  }

  // The half that makes the approval *scoped*: every remaining Studio capability
  // belongs to a checkpoint that has not opened, and a blanket approval must
  // fail this gate rather than pass it.
  // World-aware for the same reason the `APP3-S01` gate is: `APP3-S05`
  // legitimately approves its three section-09 text rows, so once it has
  // delivered they stop being evidence of a blanket Studio approval. Every row
  // belonging to a checkpoint that still has not opened stays exactly as ruled.
  const opened = new Set([
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

  // The 1024 frame draws a zoom control *and* the whole S02–S11 editing surface.
  // Re-attributing it here would turn a reference into a licence for all of it.
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
    if ((read(rootDir, key) ?? '').includes('APP3-S07')) {
      fail(`${CANONICAL_FILES[key]}: carries an APP3-S07 edit`);
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
  const scripts = Object.keys(manifest.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(`package.json: ${String(scripts)} root scripts, expected ${String(ROOT_SCRIPTS)}`);
  }

  // The curated boundary is unchanged: S07 consumes no operation at all. Each
  // withholding lasts exactly as long as its stated condition — image upload
  // until `APP3-S06`, autosave until `APP3-S10` — and neither was relaxed early.
  const curated = read(rootDir, 'curatedClient') ?? '';
  for (const withheld of [
    ...(isS10Delivered(rootDir) ? [] : ['publicDesignSessionAutosave']),
    ...(isS06Delivered(rootDir) ? [] : ['publicDesignSessionAssetCreate']),
  ]) {
    if (curated.split('\n').some((line) => line.trim().startsWith(withheld))) {
      fail(`${CANONICAL_FILES.curatedClient}: ${withheld} crossed the boundary without a consumer`);
    }
  }

  // No new production dependency. A pan-and-zoom library is exactly the shape
  // of thing that would arrive here.
  const storefront = JSON.parse(read(rootDir, 'storefrontPackage') ?? '{}');
  for (const invented of ['@embroidery/design-viewport', '@embroidery/studio-viewport']) {
    if (Object.keys(storefront.dependencies ?? {}).includes(invented)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: depends on a package S07 invented (${invented})`);
    }
  }
}

/** Every command this checkpoint adds is discoverable, and none is a root script. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  const commands = Object.freeze({
    'CMD-CHECK-APP3-S07': 'node tools/check-app3-s07.mjs',
    'CMD-TEST-APP3-S07': 'node --test tools/check-app3-s07.test.mjs',
    'CMD-TEST-APP3-S07-STOREFRONT': '--testPathPatterns=studio-viewport',
    'CMD-BENCH-APP3-S07-VIEWPORT': 'node tools/bench-app3-s07-viewport.mjs',
  });
  for (const [id, command] of Object.entries(commands)) {
    if (!index.includes(id)) fail(`${CANONICAL_FILES.index}: ${id} is not indexed`);
    if (!index.includes(command)) {
      fail(`${CANONICAL_FILES.index}: ${id} does not carry its command (${command})`);
    }
  }
  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  for (const script of Object.keys(manifest.scripts ?? {})) {
    if (script.includes('app3-s07')) {
      fail(`package.json: "${script}" is a checkpoint command and belongs in the scoped index`);
    }
  }
  // The benchmark must exist and must name both required browsers, because a
  // Chromium-only measurement closes nothing this checkpoint was given.
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

export function checkApp3S07(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkImmutability(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);

  // The runtime rules read the viewport's own source, so running them before the
  // checkpoint ships would be ruling on a viewport that does not exist.
  if (isS07Delivered(rootDir)) {
    checkViewportBoundary(rootDir, fail);
    checkSceneUntouched(rootDir, fail);
    checkZoom(rootDir, fail);
    checkViewportState(rootDir, fail);
    checkNonScope(rootDir, fail);
    checkSafeArea(rootDir, fail);
    checkPredecessorGate(rootDir, fail);
  }

  return failures;
}

const HEADLINE =
  'check:app3-s07 — one Studio viewport over the unchanged APP3-S02 scene, on exactly the three approved section-11 design rows with every remaining Studio capability row still unapproved and the 1024 frame still a D01-C1 reference: zoom as an index into a frozen finite set with no multiplier, no wheel and no arbitrary scale anywhere, one CSS transform on one wrapper outside the single <svg> so no element matrix is multiplied and the renderer adapter is never rebuilt for a viewport change, pan bounded to the interval that keeps the stage inside its own frame with a touch pointer refused to APP3-S11, viewport state as four serializable numbers in a store separate from the selection and persisted nowhere, reset on Session identity, the safe area shown or withheld as the same persisted rectangle with no locally derived second boundary, zero API traffic from any viewport action and a background query key that cannot see the viewport, no transform handle, layer, upload, undo or watermark capability, the APP3-S02 gate kept and narrowed rather than deleted, and an OpenAPI artifact, generated client, curated boundary, migration count and root-script count all unchanged.';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkApp3S07();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.log(
    failures.length === 0 ? HEADLINE : `\ncheck:app3-s07 — ${String(failures.length)} failure(s)`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

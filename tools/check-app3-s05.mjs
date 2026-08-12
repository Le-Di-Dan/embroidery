/**
 * `APP3-S05` — the mechanical gate on the Studio text capability.
 *
 * Text is the second capability that writes a Design Document, and almost every
 * way of getting it wrong leaves a working editor behind. That is what these
 * rules are shaped around:
 *
 * - **A font the registry does not control.** A picker built from a literal list
 *   looks identical to one built from `DESIGN_FONT_REGISTRY` until the day the
 *   registry changes, and a document naming an uncontrolled face is one the
 *   server will refuse and the customer already approved on screen.
 * - **A silent NFC rewrite.** `normalize('NFC')` on the way into the document
 *   makes every refusal disappear and quietly changes the customer's text.
 *   `ADR-DB1-012` §7 rejects at the boundary precisely so that cannot happen.
 * - **A local text-layout engine.** `measureText`, `getBBox` or a DOM `Range`
 *   used as geometry truth is a second answer to where an element is, and
 *   `APP3-P02` PO-08 measures text from its declared box and performs no font
 *   measurement at all.
 * - **A limit restated instead of read.** A `500` typed into a component is
 *   correct today and is not P01's answer.
 * - **A capability pulled forward.** Autosave, history, layers, upload,
 *   watermark and mobile text editing each belong to a checkpoint that has not
 *   opened, and each is easy to add while "already in the inspector".
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S05_C1_STATUS_LINES,
  S05_DESIGN_ROWS,
  S05_MI01_STATUS_LINES,
  S05_STATUS_LINES,
  acceptedSurface,
  isS05C1Delivered,
  isS05Delivered,
  isS06Delivered,
  isS04Delivered,
  isS05Mi01Delivered,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  code,
  collect,
  read,
  s05Code,
} from './check-app3-s05.sources.mjs';
import { checkResponsiveComposition, checkVariantReadiness } from './check-app3-s05-responsive.mjs';
import {
  checkArchitecture,
  checkControlledFont,
  checkGeometryBoundary,
  checkNonScope,
  checkSchemaFidelity,
  checkValidation,
} from './check-app3-s05-runtime.mjs';

export { REPO_ROOT, CANONICAL_FILES, read, code };
export {
  checkArchitecture,
  checkControlledFont,
  checkGeometryBoundary,
  checkNonScope,
  checkResponsiveComposition,
  checkSchemaFidelity,
  checkValidation,
  checkVariantReadiness,
};

/** The predecessors a text capability is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of [
    'APP3-D01',
    'APP3-D01-C1',
    'APP3-F01',
    'APP3-P01',
    'APP3-P02',
    'APP3-S01',
    'APP3-S02',
    'APP3-S03',
    'APP3-S03-C1',
    'APP3-S07',
  ]) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S05_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S05 is not recorded under a legitimate status`);
  }
  // The correction is a checkpoint of its own and is recorded as one, so a tree
  // carrying the corrected composition cannot be read as the delivery that
  // human review sent back.
  if (isS05C1Delivered(rootDir)) {
    if (!S05_C1_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
      fail(`${CANONICAL_FILES.phase}: APP3-S05-C1 is not recorded under a legitimate status`);
    }
    for (const line of [
      'APP3-S05-C1 BACKEND_CHANGE = NONE',
      'APP3-S05-C1 API_DELTA = 0',
      // The three facts a reader cannot recompute from the source: that 1024 is
      // a drawer because D01-C1 draws one, that 390 has no S05 surface because
      // S11 owns it, and that readiness is asked per variant.
      'APP3-S05-C1 TABLET_1024 = RIGHT_DRAWER_OVER_THE_STAGE',
      'APP3-S05-C1 MOBILE_390 = NO_S05_TEXT_SURFACE_APP3-S11_OWNS_IT',
      'APP3-S05-C1 FONT_READINESS = EXACT_FONTID_FONTSTYLE_FONTWEIGHT',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // The final operator intervention, recorded as its own checkpoint.
  if (isS05Mi01Delivered(rootDir)) {
    if (!S05_MI01_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
      fail(`${CANONICAL_FILES.phase}: APP3-S05-MI01 is not recorded under a legitimate status`);
    }
    for (const line of [
      'APP3-S05-MI01 API_DELTA = 0',
      // What a reader cannot recompute: that the topbar is above the stage
      // because the approved composition puts it there, and that APP3-S07's
      // strip kept every control it had rather than donating one.
      'APP3-S05-MI01 TOPBAR = FIRST_CHILD_OF_THE_STAGE_FRAME_ABOVE_THE_STAGE',
      'APP3-S05-MI01 S07_STRIP = UNCHANGED',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  if (isS05Delivered(rootDir)) {
    for (const line of [
      'APP3-S05 BACKEND_CHANGE = NONE',
      'APP3-S05 MIGRATION = NONE',
      'APP3-S05 API_DELTA = 0',
      // The three facts a reader cannot recompute from the source: that text
      // creation was audited and found unauthorised rather than forgotten, that
      // `fill` was audited and deliberately left uneditable, and where the
      // controlled binary is served from.
      'APP3-S05 SCOPE = EDIT_ONLY_NO_CREATION',
      'APP3-S05 FILL = NOT_EDITED_DELIBERATELY',
      'APP3-S05 FONT_DELIVERY = FEATURE_STYLESHEET_FONTFACE_OVER_THE_F01_BINARY',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // S05 implements none of these, and delivering it makes none of them ready.
  //
  // World-aware on `APP3-S06` alone, and on nothing else. The rule says "S05 did
  // not implement this", and that stays true once S06 implements it for itself —
  // what still proves S05 did not is its own runtime half, where every image
  // marker is refused in every file S05 owns. Every other capability is asserted
  // exactly as ruled, so a blanket "the Studio is done" still fails here.
  for (const later of [
    ...(isS04Delivered(rootDir) ? [] : ['APP3-S04']),
    ...(isS06Delivered(rootDir) ? [] : ['APP3-S06']),
    'APP3-S08',
    'APP3-S09',
    'APP3-S10',
    'APP3-S11',
  ]) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${later} is recorded complete; S05 does not implement it`);
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
  const delivered = isS05Delivered(rootDir);

  for (const [id, node] of Object.entries(S05_DESIGN_ROWS)) {
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
    if (delivered && !line.includes('APP3-S05')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S05 approval evidence`);
    }
  }

  // The half that makes the approval *scoped*: a blanket Studio approval must
  // fail this gate rather than pass it. Layers, undo, watermark, autosave and
  // mobile all belong to checkpoints that have not opened — and the image row
  // did too, until `APP3-S06` opened the one that owns it. Every other row stays
  // exactly as ruled.
  const opened = new Set([
    ...(isS06Delivered(rootDir) ? ['FIG-STUDIO-IMAGE-DESKTOP-UPLOADING'] : []),
    ...(isS04Delivered(rootDir)
      ? ['FIG-STUDIO-LAYERS-DESKTOP-REORDER', 'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT']
      : []),
    ...(isS04Delivered(rootDir) ? ['FIG-STUDIO-LAYERS-DESKTOP-DEFAULT'] : []),
  ]);
  for (const id of LATER_STUDIO_ROWS.filter((row) => !opened.has(row))) {
    if (rowStatus(registry, id) !== 'REVIEW_REQUIRED') {
      fail(`${CANONICAL_FILES.registry}: ${id} belongs to a checkpoint that has not opened`);
    }
  }
}

/** The contract world S05 inherited is exactly the one it leaves. */
export function checkImmutability(rootDir, fail) {
  const surface = acceptedSurface(rootDir);
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the published contract is missing`);
  } else {
    const document = JSON.parse(raw);
    const paths = Object.keys(document.paths ?? {});
    const operations = paths.reduce(
      (total, path) =>
        total +
        Object.keys(document.paths[path]).filter((key) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(key),
        ).length,
      0,
    );
    const schemas = Object.keys(document.components?.schemas ?? {}).length;
    if (paths.length !== surface.paths) {
      fail(
        `${CANONICAL_FILES.openapi}: ${String(paths.length)} paths, expected ${String(surface.paths)}`,
      );
    }
    if (operations !== surface.operations) {
      fail(
        `${CANONICAL_FILES.openapi}: ${String(operations)} operations, expected ${String(surface.operations)}`,
      );
    }
    if (surface.schemas !== undefined && schemas !== surface.schemas) {
      fail(
        `${CANONICAL_FILES.openapi}: ${String(schemas)} schemas, expected ${String(surface.schemas)}`,
      );
    }
  }

  const migrations = collect(join(rootDir, MIGRATIONS), /\.sql$/).length;
  if (migrations !== EXPECTED_MIGRATIONS) {
    fail(
      `${MIGRATIONS}: ${String(migrations)} migrations, expected ${String(EXPECTED_MIGRATIONS)}`,
    );
  }
  const rootPackage = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  const scripts = Object.keys(rootPackage.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(
      `${CANONICAL_FILES.rootPackage}: ${String(scripts)} root scripts, expected ${String(ROOT_SCRIPTS)}`,
    );
  }
  // Frontend only: no API, worker, database or generated-client change belongs
  // to this checkpoint, and the gate says so rather than trusting the report.
  const s05 = s05Code(rootDir);
  for (const backend of ['apps/api', 'apps/worker', 'packages/database', 'drizzle']) {
    if (s05.includes(backend)) {
      fail(`${FEATURE}: the text capability reaches a backend surface (${backend})`);
    }
  }
}

/** The three scoped commands are discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const id of ['CMD-CHECK-APP3-S05', 'CMD-TEST-APP3-S05', 'CMD-TEST-APP3-S05-STOREFRONT']) {
    if (!index.includes(`\`${id}\``)) {
      fail(`${CANONICAL_FILES.index}: ${id} is not indexed`);
    }
  }
  if (!index.includes('node tools/check-app3-s05.mjs')) {
    fail(`${CANONICAL_FILES.index}: the S05 gate command is not recorded`);
  }
  // No root script: package-owned and checkpoint commands stay out of the root.
  const rootPackage = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  for (const name of Object.keys(rootPackage.scripts ?? {})) {
    if (name.includes('app3-s05')) {
      fail(`${CANONICAL_FILES.rootPackage}: the S05 checkpoint command became a root script`);
    }
  }
}

/** Source files stay inside the repository's limits. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${relative(rootDir, path).replaceAll('\\', '/')}: ${String(lines)} lines exceeds 400`);
    }
  }
}

export function checkApp3S05(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkImmutability(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);

  // The runtime rules read the text capability's own source, so running them
  // before the checkpoint ships would rule on something that does not exist.
  if (isS05Delivered(rootDir)) {
    checkControlledFont(rootDir, fail);
    checkSchemaFidelity(rootDir, fail);
    checkValidation(rootDir, fail);
    checkGeometryBoundary(rootDir, fail);
    checkArchitecture(rootDir, fail);
    checkNonScope(rootDir, fail);
  }

  // The correction's own rules, for the same reason: they read files S05 did
  // not have, so running them on the delivered-and-sent-back tree would fail it
  // for not yet containing the answer it was asked for.
  if (isS05C1Delivered(rootDir)) {
    checkVariantReadiness(rootDir, fail);
    checkResponsiveComposition(rootDir, fail);
  }

  return failures;
}

const HEADLINE =
  'check:app3-s05 — Studio text editing (with the APP3-S05-C1 responsive and font-variant correction) on the unchanged APP3-S02 scene, the APP3-S07 viewport and the APP3-S03 transforms, on exactly the three approved section-09 design rows with every remaining Studio capability row still unapproved: a font picker built from the APP3-P01 controlled registry and nothing else, serving the exact APP3-F01 Inter binaries from the package that owns them with no copy under public and no remote font; loading, ready and unavailable reported honestly and no silent substitution; only the v1 TextElement fields edited, with no invented typography, curve or thread-colour field; every limit and range read from P01 rather than restated; a candidate validated for structure, then complexity, then the controlled variant, then APP3-P02 containment and physical size, with no NFC rewrite, no truncation and no repair; text geometry left to P02 declared boxes with no glyph measurement anywhere; one working Design Document, one native SVG scene and the APP3-S03-C1 identity reuse and memoized element all intact; no autosave, history, layer, upload, watermark or touch editing pulled forward; the inspector placed by viewport tier — beside the stage at 1440, in the accepted 618:140 right drawer over the stage at 1024, toggled from a Studio topbar mounted above the stage rather than from the APP3-S07 control strip below it, and nowhere at all on a phone, where the text editing surfaces belong to APP3-S11; controlled-font readiness asked for the exact fontId, fontStyle and fontWeight with no fallback family in the probe, so a loaded upright never speaks for a missing italic, and a variant the browser could not load never becoming document truth; and an OpenAPI artifact, generated client, migration count and root-script count all unchanged.';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkApp3S05();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.log(
    failures.length === 0 ? HEADLINE : `\ncheck:app3-s05 — ${String(failures.length)} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

#!/usr/bin/env node
/**
 * `APP3-S06` — the Studio image capability, and the two cross-layer seams it was
 * authorized to repair inside itself.
 *
 * The rules worth a machine are the ones that stay green while being wrong, and
 * this checkpoint has an unusual number of them because it spans three
 * applications:
 *
 * - A Session inspection lane that skips the full decode. The catalog lane's
 *   pixel-level verification was always a side effect of *generating* its
 *   derivatives; a lane that writes none loses it silently, and a truncated PNG
 *   is then accepted by a pipeline that only read its header.
 * - A cloned-media grant whose lane check is hoisted into the shared `WHERE`,
 *   making the document branch unreachable and the whole repair a no-op that
 *   every test still passes.
 * - A document grant that admits `CUSTOMER_UPLOAD`, turning a customer's own
 *   document into a way to read another customer's photograph.
 * - A status route that answers for media the caller does not own, or that says
 *   `READY` without the whole `APP3-DB01` quartet behind it.
 * - A read limit charged after authorization, bounding successful reads and not
 *   the probing it exists to bound.
 * - A Studio that measures a decoded `<img>` for intrinsic size, polls the Blob
 *   route as a state machine, keeps an object URL past its media, or ships a
 *   file picker at 390 where `APP3-S11` owns the surface.
 *
 * This module rules on the predecessors, the design approval and the artifacts;
 * `check-app3-s06-repairs.mjs` rules on the worker and API repairs, and
 * `check-app3-s06-frontend.mjs` on the Storefront.
 *
 * This gate does **not** read the completion report. A report is a claim; every
 * fact below is recomputed from the repository.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S04_DESIGN_ROWS,
  S06_STATUS_LINES,
  S09_DESIGN_ROWS,
  acceptedSurface,
  isS04Delivered,
  isS08Delivered,
  foreignApprovals,
  isS10Delivered,
  isS11Delivered,
  isS09Delivered,
  isS06Delivered,
} from './app3-accepted-surface.mjs';

import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  S06_DESIGN_ROWS,
  STATUS_OPERATION_ID,
  STATUS_ROUTE,
  code,
  collect,
  openapi,
  read,
} from './check-app3-s06.sources.mjs';
import {
  checkClonedMediaGrant,
  checkInspectionLane,
  checkReadLimit,
  checkStatusProjection,
} from './check-app3-s06-repairs.mjs';
import {
  checkAffordanceMirror,
  checkComposition,
  checkImageAuthority,
  checkObjectUrls,
  checkPolling,
  checkRenderer,
} from './check-app3-s06-frontend.mjs';

/** The three section-08 rows APP3-S04 owns, by id. */
const S04_LAYER_ROWS = Object.keys(S04_DESIGN_ROWS);

export { REPO_ROOT, CANONICAL_FILES, S06_DESIGN_ROWS, LATER_STUDIO_ROWS };
export { checkClonedMediaGrant, checkInspectionLane, checkReadLimit, checkStatusProjection };
export {
  checkAffordanceMirror,
  checkComposition,
  checkImageAuthority,
  checkObjectUrls,
  checkPolling,
  checkRenderer,
};

/** The predecessors an image capability is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of [
    'APP3-D01',
    'APP3-D01-C1',
    'APP3-P01',
    'APP3-P02',
    'APP3-S01',
    'APP3-S02',
    'APP3-S03',
    'APP3-S05',
    'APP3-S07',
    // The three delivery/intake authorities this capability consumes.
    'APP3-B06B',
    'APP3-B06C',
    'APP3-B07',
    'APP3-W01A',
    'APP3-W01C',
  ]) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S06_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S06 is not recorded under a legitimate status`);
  }

  if (isS06Delivered(rootDir)) {
    for (const line of [
      // The facts a reader cannot recompute from the source: that the decode was
      // a *finding* rather than a design choice, that the document grant is
      // narrowed on purpose, that the read limit is a PO-07 value, and that
      // the two follow-ups this checkpoint closed really closed.
      'APP3-S06 REPAIR_A_DECODE = FULL_DECODE_ON_A_LANE_WITH_NO_DERIVATIVE',
      'APP3-S06 REPAIR_A_OUTPUT = NO_DERIVATIVE',
      'APP3-S06 REPAIR_C_NARROWING = DOCUMENT_BRANCH_IS_TEMPLATE_SOURCE_ONLY',
      'APP3-S06 REPAIR_C_LINEAGE = PROVENANCE_NOT_PERMISSION',
      'APP3-S06 READ_RATE_LIMIT = IMP-D043 PO-07 BOOTSTRAP_RESUME_READ 60_PER_MINUTE_PER_EPHEMERAL_NETWORK_KEY',
      'APP3-S06 AUTOSAVE = NONE',
      'APP3-S06 MIGRATION = NONE',
      'APP3-S06 DEPENDENCY = NONE',
      'FU-APP3-B06C-SESSION-LANE-INSPECTION-01 = COMPLETE — CLOSED_BY_APP3-S06',
      'FU-APP3-B06C-READ-RATE-LIMIT-01 = COMPLETE — CLOSED_BY_APP3-S06',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
    // The Template intake follow-up is **not** closed here, and a phase document
    // claiming it were would be S06 taking credit for a checkpoint nobody ran.
    if (/\nFU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = COMPLETE/.test(phase)) {
      fail(`${CANONICAL_FILES.phase}: the Template intake follow-up is recorded closed by S06`);
    }
  }

  // S06 implements none of these, and delivering it makes none of them ready.
  // World-aware on APP3-S04: "S06 did not implement this" stays true once S04
  // implements it for itself, and the S04 gate is what checks that.
  const notImplementedByS06 = isS11Delivered(rootDir) ? ['APP3-E01'] : ['APP3-S11', 'APP3-E01'];
  if (!isS08Delivered(rootDir)) notImplementedByS06.push('APP3-S08');
  if (!isS10Delivered(rootDir)) notImplementedByS06.push('APP3-S10');
  if (!isS09Delivered(rootDir)) notImplementedByS06.push('APP3-S09');
  if (!isS04Delivered(rootDir)) notImplementedByS06.push('APP3-S04');
  for (const later of notImplementedByS06) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${later} is recorded complete; S06 does not implement it`);
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
  const delivered = isS06Delivered(rootDir);

  for (const [id, node] of Object.entries(S06_DESIGN_ROWS)) {
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
    if (delivered && !line.includes('APP3-S06')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S06 approval evidence`);
    }
  }

  // The half that makes the approval *scoped*: a blanket Studio approval must
  // fail this gate rather than pass it. The mobile image sheet is in this list
  // deliberately — it is the same *capability* and a different checkpoint, and
  // approving the desktop rows must not carry it along.
  // World-aware on the rows whose own checkpoint has opened, and on nothing
  // else. `APP3-S04` legitimately approves its three section-08 frames, so once
  // it has delivered they stop being evidence of a blanket approval — while
  // every row belonging to a checkpoint that still has not opened stays exactly
  // as ruled.
  const opened = new Set([
    ...(isS04Delivered(rootDir) ? S04_LAYER_ROWS : []),
    ...(isS09Delivered(rootDir) ? S09_DESIGN_ROWS : []),
    ...(isS08Delivered(rootDir) ? ['FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY'] : []),
    ...(isS10Delivered(rootDir) ? ['FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED'] : []),
    ...(isS11Delivered(rootDir)
      ? ['FIG-STUDIO-MOBILE-STAGE-SELECTED', 'FIG-STUDIO-MOBILE-IMAGESHEET']
      : []),
  ]);
  for (const id of LATER_STUDIO_ROWS.filter((row) => !opened.has(row))) {
    if (rowStatus(registry, id) !== 'REVIEW_REQUIRED') {
      fail(`${CANONICAL_FILES.registry}: ${id} belongs to a checkpoint that has not opened`);
    }
  }

  /*
   * The guard that does not empty itself.
   *
   * The rule above is world-aware, and `APP3-S11` is where that catches up with
   * it: with section 15 released there is no Studio row left belonging to an
   * unopened checkpoint, so the loop runs over nothing and asserts nothing —
   * exactly the failure `APP3-S04` recorded once already.
   *
   * A blanket approval was never really "a later row is approved". It is "a row
   * was released by a checkpoint that did not own it", and that stays checkable
   * forever: this checkpoint may be the approval evidence for its own rows and
   * for no others.
   */
  for (const claimed of foreignApprovals(registry, 'APP3-S06', Object.keys(S06_DESIGN_ROWS))) {
    fail(`${CANONICAL_FILES.registry}: ${claimed} was approved as APP3-S06 evidence`);
  }
}

/** Exactly one new operation, at exactly one address, and nothing else moved. */
export function checkSurface(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the generated OpenAPI artifact is missing`);
    return;
  }

  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {});
  const operations = paths.reduce(
    (total, path) =>
      total +
      Object.keys(document.paths[path]).filter((key) =>
        ['get', 'put', 'post', 'patch', 'delete'].includes(key),
      ).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;

  if (paths.length !== surface.paths) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(paths.length)} paths; expected ${String(surface.paths)}`,
    );
  }
  if (operations !== surface.operations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(operations)} operations; expected ${String(surface.operations)}`,
    );
  }
  if (schemas !== surface.schemas) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(schemas)} schemas; expected ${String(surface.schemas)}`,
    );
  }

  if (!isS06Delivered(rootDir)) return;

  const item = document.paths?.[STATUS_ROUTE];
  if (item === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${STATUS_ROUTE} is not published`);
    return;
  }
  const methods = Object.keys(item).filter((key) =>
    ['get', 'put', 'post', 'patch', 'delete'].includes(key),
  );
  if (methods.length !== 1 || methods[0] !== 'get') {
    fail(
      `${CANONICAL_FILES.openapi}: ${STATUS_ROUTE} declares ${methods.join(', ')}; expected get`,
    );
  }
  if (item.get?.operationId !== STATUS_OPERATION_ID) {
    fail(
      `${CANONICAL_FILES.openapi}: ${STATUS_ROUTE} publishes ${String(item.get?.operationId)}; ` +
        `expected ${STATUS_OPERATION_ID}`,
    );
  }
  // The accepted upload and delivery ids are unchanged — a controller split is
  // exactly how they get silently reissued (`APP3-B04A`).
  const published = paths.flatMap((path) =>
    Object.values(document.paths[path]).map((operation) => operation?.operationId),
  );
  for (const id of ['publicDesignSessionAsset_create', 'publicDesignSessionAsset_get']) {
    if (!published.includes(id)) {
      fail(`${CANONICAL_FILES.openapi}: the accepted operation ${id} was reissued or removed`);
    }
  }
  // No generic Asset status address, however spelled.
  for (const path of paths) {
    if (!path.startsWith('/api/public/')) continue;
    if (!/status$/.test(path)) continue;
    if (path === STATUS_ROUTE) continue;
    fail(`${CANONICAL_FILES.openapi}: "${path}" is a second public status address`);
  }
}

/** The artifacts a Storefront capability with one narrow read may move. */
export function checkImmutability(rootDir, fail) {
  const migrations = collect(join(rootDir, MIGRATIONS), /\.sql$/).length;
  if (migrations !== EXPECTED_MIGRATIONS) {
    fail(
      `${MIGRATIONS}: ${String(migrations)} migrations; expected ${String(EXPECTED_MIGRATIONS)}`,
    );
  }
  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  const scripts = Object.keys(manifest.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(`package.json: ${String(scripts)} root scripts; expected ${String(ROOT_SCRIPTS)}`);
  }

  // No new dependency, in any workspace this checkpoint touched.
  for (const pkg of [
    'apps/storefront/package.json',
    'apps/api/package.json',
    'apps/worker/package.json',
  ]) {
    const raw = read(rootDir, pkg);
    if (raw === undefined) continue;
    const parsed = JSON.parse(raw);
    for (const name of Object.keys(parsed.dependencies ?? {})) {
      if (/sharp-|image-|jimp|canvas|fabric|konva|filepond|uppy|dropzone/.test(name)) {
        fail(`${pkg}: introduces the image/upload dependency "${name}"`);
      }
    }
  }

  // The three curated operations crossed the boundary together. Autosave stayed
  // behind until `APP3-S10` delivered the screen that owns saving — the exact
  // condition its withholding stated, satisfied rather than relaxed.
  const curated = read(rootDir, 'curatedClient') ?? '';
  if (isS06Delivered(rootDir)) {
    for (const operation of [
      'publicDesignSessionAssetCreate',
      'publicDesignSessionAssetGet',
      'publicDesignSessionAssetStatus',
    ]) {
      if (!curated.includes(operation)) {
        fail(`${CANONICAL_FILES.curatedClient}: ${operation} is not exported to its consumer`);
      }
    }
  }
  const withheld = [
    ...(isS10Delivered(rootDir) ? [] : ['publicDesignSessionAutosave']),
    // No screen fetches a product image through the client: the browser loads
    // them from the relative `media[].url` the catalog responses already carry.
    'publicProductMediaGet',
  ];
  for (const operation of withheld) {
    if (curated.split('\n').some((line) => line.trim().startsWith(operation))) {
      fail(
        `${CANONICAL_FILES.curatedClient}: ${operation} crossed the boundary without a consumer`,
      );
    }
  }
}

/** The scoped commands this checkpoint added are discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-S06',
    'CMD-TEST-APP3-S06',
    'CMD-TEST-APP3-S06-WORKER',
    'CMD-TEST-APP3-S06-API',
  ]) {
    if (!index.includes(id)) {
      fail(`${CANONICAL_FILES.index}: ${id} is not registered`);
    }
  }
}

/** CLAUDE.md §6, for every file this checkpoint owns. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${relative(rootDir, path).replaceAll('\\', '/')}: ${String(lines)} lines exceeds 400`);
    }
  }
  for (const key of [
    'lane',
    'statusController',
    'statusService',
    'statusResponse',
    'grant',
    'adapter',
  ]) {
    const raw = read(rootDir, key);
    if (raw === undefined) {
      fail(`${CANONICAL_FILES[key]}: missing`);
      continue;
    }
    const lines = raw.split('\n').length;
    if (lines > 400) {
      fail(`${CANONICAL_FILES[key]}: ${String(lines)} lines exceeds 400`);
    }
  }
}

export function checkApp3S06(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkSurface(rootDir, fail);
  checkImmutability(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);

  // The runtime rules read this checkpoint's own source, so running them before
  // it ships would rule on something that does not exist.
  if (isS06Delivered(rootDir)) {
    checkInspectionLane(rootDir, fail);
    checkStatusProjection(rootDir, fail);
    checkClonedMediaGrant(rootDir, fail);
    checkReadLimit(rootDir, fail);
    checkImageAuthority(rootDir, fail);
    checkPolling(rootDir, fail);
    checkObjectUrls(rootDir, fail);
    checkRenderer(rootDir, fail);
    checkComposition(rootDir, fail);
    checkAffordanceMirror(rootDir, fail);
  }

  return failures;
}

const HEADLINE =
  'check:app3-s06 — the Studio image capability on exactly the four approved section-10 design rows, ' +
  'with the mobile image sheet and every other Studio row still unapproved: a real journey from a ' +
  'chosen file through APP3-B06B intake, a repaired Session inspection lane, the unchanged APP3-W01C ' +
  'normalization convergence and the APP3-B06C private Blob to a valid APP3-P01 ImageElement placed ' +
  'by APP3-P02; one inspection pipeline parameterized by a lane matched on the kind/classification ' +
  'pair, the catalog lane unchanged, the Session lane writing no derivative of its own, and the ' +
  'full pixel decode made explicit — derived from the lane having no output — because it had only ' +
  'ever been a side effect of generating one; exactly one narrow contextual status projection ' +
  'scoped to the upload association, carrying the APP3-DB01 quartet and nothing about storage, ' +
  'rejection reasons or the worker; a delivery grant of two branches where the customer-private ' +
  'lane stays inside the upload branch and the document branch admits TEMPLATE_SOURCE only, so a ' +
  'document reference can never reach another customer’s upload and no branch consults Template ' +
  'lineage; a 60/minute read limit charged before authorization and attributed to the IMP-D043 ' +
  'PO-07 control it has always been; an initial image box constructed from the tighter of the ' +
  'Embroidery Area rectangle and the Area’s own physical maxima, so a maximum smaller than the ' +
  'rectangle places a smaller picture instead of inserting nothing; intrinsic dimensions taken ' +
  'only from the server’s measurement ' +
  'with no naturalWidth, getBBox or Blob inspection anywhere; the status projection polled and the ' +
  'binary route never polled as a state machine; object URLs keyed by derivative, runtime-only and ' +
  'revoked on cleanup; one native SVG scene where a ready image is an <image> and everything else ' +
  'is still the honest placeholder; one topbar, one right drawer and no mobile editing surface at ' +
  'all; no autosave, layers, history, watermark, crop, opacity or touch editing pulled forward; and ' +
  'a migration count, root-script count and dependency set all unchanged.';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkApp3S06();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.log(
    failures.length === 0 ? HEADLINE : `\ncheck:app3-s06 — ${String(failures.length)} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

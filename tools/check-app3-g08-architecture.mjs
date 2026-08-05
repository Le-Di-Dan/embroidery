#!/usr/bin/env node
/**
 * `APP3-G08` — the architecture half, runnable alone.
 *
 * Everything here asserts a property of the *repository* rather than of the
 * record: what the ruling must say, who owns session bootstrap, what the
 * normalization worker actually does with a not-yet-inspected Asset, that the
 * storage port still has exactly six methods and no presign, and that no
 * implementation has appeared before the checkpoint that owns it.
 *
 * Split from `check-app3-g08.mjs` on responsibility rather than line count:
 * these are the checks a reviewer runs when the question is "has the
 * architecture moved", and the parent's are the ones for "has it been
 * recorded". It owns the shared file map so the dependency runs one way only.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DECISION_ID = 'IMP-D048';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  traceability: 'docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md',
  sourceMap: 'docs/implementation/13-PHASE-SOURCE-MAP.md',
  security: 'docs/09-SECURITY-AND-ABUSE-PREVENTION.md',
  nfr: 'docs/10-NON-FUNCTIONAL-REQUIREMENTS.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  report: 'docs/implementation/reports/APP3-G08-COMPLETION-REPORT.md',
  rootManifest: 'package.json',
  storagePort: 'packages/object-storage/src/object-storage.port.ts',
  storageIndex: 'packages/object-storage/src/index.ts',
  associationResolver:
    'apps/worker/src/jobs/asset-normalization/application/association-resolution.service.ts',
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  sessionRepository: 'apps/api/src/modules/design/domain/repositories/design-session.repository.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strips comment lines, so prose explaining an absence never reads as presence. */
function code(text) {
  return text.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
}

/**
 * 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 16 — the ruling says what it must say.
 *
 * Asserted against the register row rather than the phase prose: the register is
 * the authority a future checkpoint reads, and a ruling that survives only in a
 * narrative section is one an implementer can miss.
 */
export function checkRulingSubstance(row, fail) {
  const required = [
    ['API_OWNED_MULTIPART_STREAMING', 'multipart streaming architecture'],
    ['presign', 'the presign refusal'],
    ['POST /api/public/design-sessions/:sessionId/assets', 'the B06B route'],
    ['`paths 19 → 20`', 'the expected path delta'],
    ['`operations 23 → 24`', 'the expected operation delta'],
    ['image/jpeg', 'the JPEG allowance'],
    ['image/png', 'the PNG allowance'],
    ['image/webp', 'the WebP allowance'],
    ['image/svg+xml', 'the SVG refusal'],
    ['10 MiB', 'the source limit'],
    ['CUSTOMER_UPLOAD', 'the asset lane'],
    ['CUSTOMER_PRIVATE', 'the asset classification'],
    ['IdempotencyAllocationStore', 'reuse of the APP2 claim protocol'],
    ['No object-storage network call occurs inside the database transaction', 'the boundary rule'],
    ['asset.normalization.requested', 'the normalization event'],
    ['DESIGN_SESSION_ASSET', 'the association reference kind'],
    ['designSessionAssetId', 'the association identity'],
    ['APP3-W01C', 'the ordering route'],
    ['APP3-B07', 'the bootstrap owner'],
    ['uq_design_session_assets__session_asset', 'the association uniqueness authority'],
  ];
  for (const [needle, what] of required) {
    if (!row.includes(needle)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ${what}`);
    }
  }
  if (/\bpolling loop\b/i.test(row) && !row.includes('adds no polling loop')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} appears to authorize a polling architecture`);
  }
}

/**
 * 6 — the bootstrap owner is the one the plan already has.
 *
 * The directive offered `APP3-B06A` as a bounded home for bootstrap *only* if no
 * accepted checkpoint owned it. One does, so this recomputes the owner from the
 * checkpoint table and refuses a plan that hands the same credential to a second
 * issuer. Both halves read **table rows**, never prose: §6.22.3 explains at
 * length why B06A does not own bootstrap, and a check that scanned the whole
 * document would fail on the very sentence that says so.
 */
export function checkBootstrapOwner(phase, fail) {
  const rowsFor = (id) =>
    phase
      .split('\n')
      .filter((line) => new RegExp(`^\\|\\s*\\S+\\s*\\|\\s*\`${id}\``).test(line.trim()));

  const [owner] = rowsFor('APP3-B07');
  if (owner === undefined) {
    fail(`${CANONICAL_FILES.phase}: APP3-B07 has no checkpoint-table row`);
  } else if (!/session bootstrap/i.test(owner)) {
    fail(`${CANONICAL_FILES.phase}: APP3-B07 no longer owns session bootstrap`);
  }
  if (rowsFor('APP3-B06A').some((line) => /bootstrap/i.test(line))) {
    fail(`${CANONICAL_FILES.phase}: APP3-B06A must not also own session bootstrap`);
  }
}

/**
 * 15 — the ordering defect is stated as measured, not as a risk.
 *
 * The gate reads the real worker: if `REQUIRED_ASSET_STATUS` ever stops being
 * `ACCEPTED`, or the resolver stops treating a non-matching status as a
 * rejection, then the premise of the `APP3-W01C` route has changed and the
 * ruling must be re-derived rather than quietly kept.
 */
export function checkOrderingPremise(rootDir, fail) {
  const resolver = read(rootDir, 'associationResolver');
  if (resolver === undefined) {
    fail(`${CANONICAL_FILES.associationResolver}: missing`);
    return;
  }
  if (!/const REQUIRED_ASSET_STATUS = 'ACCEPTED';/.test(resolver)) {
    fail(`${CANONICAL_FILES.associationResolver}: REQUIRED_ASSET_STATUS is no longer 'ACCEPTED'`);
  }
  if (!/status !== REQUIRED_ASSET_STATUS/.test(resolver)) {
    fail(
      `${CANONICAL_FILES.associationResolver}: the status comparison the W01C route rests on is gone`,
    );
  }
  if (!/normalizationRejection\('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE'\)/.test(resolver)) {
    fail(`${CANONICAL_FILES.associationResolver}: the terminal verdict is no longer raised`);
  }
}

/** 3 — the storage port is untouched and still has no presign. */
export function checkStoragePortUnchanged(rootDir, fail) {
  const port = read(rootDir, 'storagePort');
  if (port === undefined) {
    fail(`${CANONICAL_FILES.storagePort}: missing`);
    return;
  }
  const methods = port.match(/^\s{2}[a-zA-Z][a-zA-Z0-9]*\(/gm) ?? [];
  if (methods.length !== 6) {
    fail(
      `${CANONICAL_FILES.storagePort}: ${String(methods.length)} methods, expected 6 — a capability was added`,
    );
  }
  if (/presign|getSignedUrl|createPresigned/i.test(code(port))) {
    fail(`${CANONICAL_FILES.storagePort}: a presign capability appeared`);
  }
  const index = read(rootDir, 'storageIndex') ?? '';
  if (/presign|SignedUrl/i.test(code(index))) {
    fail(`${CANONICAL_FILES.storageIndex}: exports a presign capability`);
  }
}

/**
 * 17 — G08 implements nothing, in whichever world this repository is in.
 *
 * Two consistent worlds are accepted and every mixture fails: before `B06B`
 * (no public design-session route, no design module in the composition root,
 * and the accepted 19-path surface) and after (the route exists and the phase
 * records it). A gate that only ever demanded the absence would have to be
 * deleted the day its own ruling was carried out.
 */
export function checkNoImplementation(rootDir, status, fail) {
  const delivered = /\nAPP3-B06B = COMPLETE/.test(status);
  const appModule = read(rootDir, 'appModule') ?? '';
  const openapi = read(rootDir, 'openapi') ?? '{}';
  const hasRoute = openapi.includes('/public/design-sessions/');
  const composed = /DesignModule|DesignSessionAssetModule/.test(appModule);

  if (delivered) {
    if (!hasRoute) {
      fail(`${CANONICAL_FILES.openapi}: APP3-B06B is recorded complete but publishes no route`);
    }
    if (!composed) {
      fail(`${CANONICAL_FILES.appModule}: APP3-B06B is recorded complete but is not composed`);
    }
    return;
  }
  if (hasRoute) {
    fail(`${CANONICAL_FILES.openapi}: a design-session route exists before APP3-B06B is recorded`);
  }
  if (composed) {
    fail(`${CANONICAL_FILES.appModule}: a design module is composed before APP3-B06B is recorded`);
  }
  const paths = Object.keys(JSON.parse(openapi).paths ?? {}).length;
  if (paths !== 19) {
    fail(`${CANONICAL_FILES.openapi}: ${String(paths)} paths, expected the accepted 19`);
  }
}

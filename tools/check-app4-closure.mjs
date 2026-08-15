#!/usr/bin/env node
/**
 * `APP4-X01` closure gate.
 *
 * Asserts the **current world** APP4 was actually delivered into — not the P00
 * prediction. Execution legitimately moved several facts (an eleventh feature
 * endpoint arrived with the A01 authority unblock, the Admin transport operation
 * is `/replay`, the backend split became `B02…B08`), so a gate written against
 * the original plan would fail on correct code and pass on a regression.
 *
 * It reads committed artifacts and closure documentation. It runs no runtime
 * suite, opens no database, starts no container and makes no network call: the
 * expensive live evidence was consumed by `APP4-E01-R01` and `R01-C1`, and this
 * gate exists to stop that evidence drifting away from the documents, not to
 * reproduce it.
 *
 * Deliberately independent of the stale `APP4-B01`/`APP4-B02` checkers: that
 * tooling debt is carried, and a closure gate that depended on it would turn an
 * unrelated stale checker into an APP4 correctness blocker.
 *
 * Usage: node tools/check-app4-closure.mjs [--world <dir>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** The frozen `APP4-X01` baseline. Every value was measured, none assumed. */
export const APP4_BASELINE = Object.freeze({
  canonicalCheckpoints: 17,
  featureEndpoints: 11,
  b07Endpoints: 4,
  openapi: Object.freeze({
    paths: 48,
    operations: 53,
    schemas: 101,
    sha256: '02bd969c17aa3899209ed563d51c0add30142874fb64ee96294b1009528e8d7b',
  }),
  generatedClientTreeHash: 'ee7ea2af2eb79f2ffc00b6a477167628f32d7995b50ab4e415bffc7bb9c2f90f',
  database: Object.freeze({
    tables: 78,
    migrations: 34,
    latestMigration: '0034_add_app3_placement_and_derivative_authority.sql',
  }),
  figma: Object.freeze({ rows: 48, d01Approval: 30, a01UnblockApproval: 18 }),
});

const CHECKPOINT_IDS = Object.freeze([
  'APP4-P00',
  'APP4-G01',
  'APP4-D01',
  'APP4-P01',
  'APP4-B01',
  'APP4-W01',
  'APP4-B02',
  'APP4-B03',
  'APP4-B04',
  'APP4-B05',
  'APP4-B06',
  'APP4-B07',
  'APP4-B08',
  'APP4-S01',
  'APP4-S02',
  'APP4-A01',
  'APP4-E01',
]);

/** The E01 replan stages that must remain visible as constituent history. */
const E01_STAGES = Object.freeze([
  'APP4-E01-H01',
  'APP4-E01-H02',
  'APP4-E01-R01',
  'APP4-E01-R01-C1',
]);

const EXIT_GATE_MARKERS = Object.freeze(['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4', 'Gate 5']);

const FORBIDDEN_OWNERS = Object.freeze(['TBD', 'someone', 'to be decided']);

/**
 * Reads a world. `--world` lets the tests build synthetic repositories rather
 * than mutate the real one, which is the only way to prove the gate *rejects*.
 */
function readWorld(root) {
  const read = (relative) => {
    const path = join(root, relative);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  };
  return {
    root,
    matrix: read('docs/implementation/reports/APP4-CLOSURE-MATRIX.md'),
    figma: read('docs/design/FIGMA_DESIGN_INDEX.md'),
    openapiRaw: (() => {
      const path = join(root, 'packages/contracts/openapi/openapi.generated.json');
      return existsSync(path) ? readFileSync(path) : undefined;
    })(),
    reports: (name) => read(`docs/implementation/reports/${name}`),
    reportExists: (name) => existsSync(join(root, `docs/implementation/reports/${name}`)),
  };
}

/** Counts operations in an OpenAPI document without a schema library. */
function measureOpenApi(raw) {
  const document = JSON.parse(raw.toString());
  const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];
  const paths = Object.keys(document.paths ?? {});
  let operations = 0;
  const featureEndpoints = [];
  const b07Endpoints = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of methods) {
      if (item[method] === undefined) continue;
      operations += 1;
      const isApp4 =
        /\/verification\/|\/secure-links\/|\/admin\/customers|\/admin\/secure-grants|\/admin\/notification-intents/.test(
          path,
        );
      if (isApp4) featureEndpoints.push(`${method.toUpperCase()} ${path}`);
      if (/\/admin\/customers|\/admin\/secure-grants/.test(path)) {
        b07Endpoints.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return {
    paths: paths.length,
    operations,
    schemas: Object.keys(document.components?.schemas ?? {}).length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    featureEndpoints,
    b07Endpoints,
    hasReplay: featureEndpoints.some((e) => e.includes('/replay')),
    hasRetry: featureEndpoints.some((e) => e.includes('/retry')),
  };
}

/** Every assertion, as data, so a failure names the rule that failed. */
export function evaluate(world) {
  const failures = [];
  const facts = {};
  const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);

  const matrix = world.matrix;
  if (matrix === undefined) {
    fail('closure-matrix', 'APP4-CLOSURE-MATRIX.md is missing');
    return { failures, facts, verdict: 'BLOCKED' };
  }

  // --- canonical checkpoints -------------------------------------------------
  const missing = CHECKPOINT_IDS.filter((id) => !matrix.includes(id));
  if (missing.length > 0) {
    fail('canonical-checkpoints', `not accounted for: ${missing.join(', ')}`);
  }
  facts.canonicalCheckpoints = CHECKPOINT_IDS.length - missing.length;

  // --- E01 constituent history ----------------------------------------------
  const missingStages = E01_STAGES.filter((id) => !matrix.includes(id));
  if (missingStages.length > 0) {
    fail('e01-history', `constituent stages missing: ${missingStages.join(', ')}`);
  }
  if (!matrix.includes('PASS_AFTER_R01_C1')) {
    fail('e01-status', 'APP4-E01 must be PASS_AFTER_R01_C1');
  }
  if (!world.reportExists('APP4-E01-R01-C1-COMPLETION-REPORT.md')) {
    fail('r01-c1', 'the R01-C1 completion report is absent');
  }
  // Existence, not mention: the matrix is *required* to state that no C2 exists,
  // so a bare `/R01-C2/` match would fail on the prohibition itself.
  if (world.reportExists('APP4-E01-R01-C2-COMPLETION-REPORT.md')) {
    fail('r01-c2', 'an APP4-E01-R01-C2 report exists; it is forbidden');
  }
  if (!/No\s+`?APP4-E01-R01-C2/i.test(matrix)) {
    fail('r01-c2', 'the matrix does not record that no APP4-E01-R01-C2 exists');
  }

  // --- the replay-through-worker and expiry proofs C1 added ------------------
  const c1 = world.reports('APP4-E01-R01-C1-COMPLETION-REPORT.md') ?? '';
  if (!/replayWorkerClaimedNewOutbox/.test(c1) || !/replayDeliveryRecorded/.test(c1)) {
    fail('replay-through-worker', 'the replay claim/open/deliver proof is not recorded');
  }
  if (!/expiredCodeEqualsUnknown/.test(c1)) {
    fail('expired-rejection', 'the expired-grant rejection equivalence is not recorded');
  }
  if (!/CLOSED_BY_R01_C1/.test(matrix)) {
    fail('b08-followup', 'the B08 replay-through-worker follow-up is not closed by R01-C1');
  }

  // --- exit gates ------------------------------------------------------------
  const missingGates = EXIT_GATE_MARKERS.filter((g) => !matrix.includes(g));
  if (missingGates.length > 0) {
    fail('exit-gates', `not mapped to evidence: ${missingGates.join(', ')}`);
  }

  // --- follow-ups ------------------------------------------------------------
  const blockingMatch = /blocking follow-ups\s*=\s*(\d+)/.exec(matrix);
  const nonblockingMatch = /nonblocking follow-ups\s*=\s*(\d+)/.exec(matrix);
  const ownerlessMatch = /ownerless follow-ups\s*=\s*(\d+)/.exec(matrix);
  const blocking = blockingMatch ? Number(blockingMatch[1]) : Number.NaN;
  const nonblocking = nonblockingMatch ? Number(nonblockingMatch[1]) : Number.NaN;
  const ownerless = ownerlessMatch ? Number(ownerlessMatch[1]) : Number.NaN;
  if (!Number.isFinite(blocking) || !Number.isFinite(nonblocking) || !Number.isFinite(ownerless)) {
    fail('follow-up-counts', 'the follow-up tally is missing or unparseable');
  }
  if (blocking > 0) fail('blocking-follow-up', `${blocking} blocking item(s) remain`);
  if (ownerless > 0) fail('ownerless-follow-up', `${ownerless} item(s) have no owner`);
  for (const owner of FORBIDDEN_OWNERS) {
    if (new RegExp(`\\|\\s*\\*{0,2}${owner}`, 'i').test(matrix)) {
      fail('vague-owner', `"${owner}" is not a concrete owner`);
    }
  }
  facts.blockingFollowUps = blocking;
  facts.nonblockingFollowUps = nonblocking;

  // --- provider / readiness claims ------------------------------------------
  if (!/IMP-O006/.test(matrix)) {
    fail('imp-o006', 'IMP-O006 is not routed');
  }
  if (/provider\s+selected\s*=\s*true/i.test(matrix) || /provider chosen/i.test(matrix)) {
    fail('provider-claim', 'an external notification provider is falsely claimed');
  }
  if (/production[- ]ready\b/i.test(matrix)) {
    fail('readiness-claim', 'a production-readiness claim is present');
  }

  // --- APP5 boundary ---------------------------------------------------------
  if (!/APP5\s*=\s*NOT_STARTED/.test(matrix)) {
    fail('app5', 'APP5 must be recorded as NOT_STARTED');
  }

  // --- OpenAPI ---------------------------------------------------------------
  if (world.openapiRaw === undefined) {
    fail('openapi', 'the committed OpenAPI artifact is missing');
  } else {
    const measured = measureOpenApi(world.openapiRaw);
    facts.openapi = {
      paths: measured.paths,
      operations: measured.operations,
      schemas: measured.schemas,
      sha256: measured.sha256,
    };
    facts.featureEndpoints = measured.featureEndpoints.length;
    facts.b07Endpoints = measured.b07Endpoints.length;
    const expected = APP4_BASELINE.openapi;
    if (measured.paths !== expected.paths) {
      fail('openapi-paths', `${measured.paths} != frozen ${expected.paths}`);
    }
    if (measured.operations !== expected.operations) {
      fail('openapi-operations', `${measured.operations} != frozen ${expected.operations}`);
    }
    if (measured.schemas !== expected.schemas) {
      fail('openapi-schemas', `${measured.schemas} != frozen ${expected.schemas}`);
    }
    if (measured.sha256 !== expected.sha256) {
      fail('openapi-sha256', 'the artifact hash drifted from the frozen baseline');
    }
    if (measured.featureEndpoints.length !== APP4_BASELINE.featureEndpoints) {
      fail(
        'feature-endpoints',
        `${measured.featureEndpoints.length} != ${APP4_BASELINE.featureEndpoints} (the stale plan said 10)`,
      );
    }
    if (measured.b07Endpoints.length !== APP4_BASELINE.b07Endpoints) {
      fail('b07-endpoints', `${measured.b07Endpoints.length} != ${APP4_BASELINE.b07Endpoints}`);
    }
    if (!measured.hasReplay) fail('b08-operation', 'the /replay operation is absent');
    if (measured.hasRetry) fail('b08-operation', '/retry has returned as an APP4 operation');
  }

  // --- generated client ------------------------------------------------------
  if (!matrix.includes(APP4_BASELINE.generatedClientTreeHash)) {
    fail('generated-client', 'the frozen generated-client tree hash is not recorded');
  }

  // --- database --------------------------------------------------------------
  if (!/NO_APP4_MIGRATION\s*=\s*true/.test(matrix)) {
    fail('no-app4-migration', 'NO_APP4_MIGRATION is not asserted');
  }
  if (!matrix.includes(APP4_BASELINE.database.latestMigration)) {
    fail('db-baseline', 'the latest migration identity is not frozen');
  }
  for (const [label, value] of [
    ['tables', APP4_BASELINE.database.tables],
    ['migrations', APP4_BASELINE.database.migrations],
  ]) {
    if (!new RegExp(`${label}\\s*=\\s*${value}\\b`).test(matrix)) {
      fail('db-baseline', `${label} = ${value} is not frozen`);
    }
  }

  // --- Figma -----------------------------------------------------------------
  if (world.figma === undefined) {
    fail('figma', 'FIGMA_DESIGN_INDEX.md is missing');
  } else {
    const rowCount = (pattern) =>
      (world.figma.match(new RegExp(`^\\|.*${pattern}`, 'gm')) ?? []).length;
    const d01 = rowCount('FIG-APPROVAL-APP4-D01-PO-001');
    const a01 = rowCount('FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001');
    facts.figma = { d01, a01, total: d01 + a01 };
    if (d01 !== APP4_BASELINE.figma.d01Approval) {
      fail('figma-d01-rows', `${d01} != ${APP4_BASELINE.figma.d01Approval}`);
    }
    if (a01 !== APP4_BASELINE.figma.a01UnblockApproval) {
      fail('figma-a01-rows', `${a01} != ${APP4_BASELINE.figma.a01UnblockApproval}`);
    }
    if (d01 + a01 !== APP4_BASELINE.figma.rows) {
      fail('figma-rows', `${d01 + a01} APP4 rows != ${APP4_BASELINE.figma.rows}`);
    }
  }

  const verdict =
    failures.length > 0 ? 'BLOCKED' : nonblocking > 0 ? 'PASS_WITH_FOLLOW_UPS' : 'PASS';
  return { failures, facts, verdict };
}

function main() {
  const worldIndex = process.argv.indexOf('--world');
  const root = worldIndex === -1 ? process.cwd() : process.argv[worldIndex + 1];
  const { failures, facts, verdict } = evaluate(readWorld(root));

  for (const failure of failures) {
    process.stderr.write(`[app4-closure] FAIL ${failure}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(`[app4-closure] verdict=${verdict} (${failures.length} failure(s))\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `[app4-closure] ${facts.canonicalCheckpoints} canonical checkpoints · ` +
      `${facts.featureEndpoints} feature endpoints (B07 ${facts.b07Endpoints}) · ` +
      `OpenAPI ${facts.openapi.paths}p/${facts.openapi.operations}o/${facts.openapi.schemas}s · ` +
      `Figma ${facts.figma.total} rows (${facts.figma.d01}+${facts.figma.a01}) · ` +
      `${facts.blockingFollowUps} blocking / ${facts.nonblockingFollowUps} nonblocking follow-ups\n`,
  );
  process.stdout.write(`[app4-closure] APP4 = ${verdict}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('check-app4-closure.mjs')) {
  main();
}

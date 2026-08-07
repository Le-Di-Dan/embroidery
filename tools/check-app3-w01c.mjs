#!/usr/bin/env node
/**
 * `APP3-W01C` — retry Session normalization while inspection is in progress.
 *
 * The gate exists because the one changed semantic is easy to widen by accident.
 * Making *any* not-yet-`ACCEPTED` Asset retryable reads as a one-word
 * simplification and turns a rejected file into an infinite retry; widening it
 * past the session lane does the same to a retired Product Side. So the
 * narrowing is asserted from both ends. It also protects *where* the refusal
 * happens: before the derivative claim, which is the only reason a waiting
 * attempt strands no `PROCESSING` row.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01c.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3G06 } from './check-app3-g06.mjs';
import { checkApp3G08 } from './check-app3-g08.mjs';
import { checkApp3W01A } from './check-app3-w01a.mjs';
import { checkApp3W01B } from './check-app3-w01b.mjs';
import { acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const JOB_DIR = 'apps/worker/src/jobs/asset-normalization';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  report: 'docs/implementation/reports/APP3-W01C-COMPLETION-REPORT.md',
  rootManifest: 'package.json',
  workerManifest: 'apps/worker/package.json',
  pending: `${JOB_DIR}/domain/inspection-pending.ts`,
  resolver: `${JOB_DIR}/application/association-resolution.service.ts`,
  useCase: `${JOB_DIR}/application/asset-normalization.usecase.ts`,
  handler: `${JOB_DIR}/asset-normalization.handler.ts`,
  outcome: `${JOB_DIR}/domain/normalization-outcome.ts`,
  repository: `${JOB_DIR}/infrastructure/persistence/sql-asset-normalization.repository.ts`,
  errors: 'apps/worker/src/runtime/errors/worker-job-error.ts',
  resolverSpec: `${JOB_DIR}/application/association-resolution.service.spec.ts`,
  convergenceSpec: `${JOB_DIR}/tests/asset-normalization-session-inspection.integration.spec.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const ROOT_SCRIPT_COUNT = 30;
const [SOFT_CAP_CHECKER, SOFT_CAP_TEST, SOURCE_LIMIT, TEST_LIMIT] = [450, 700, 400, 600];

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strips comments, so prose describing a refusal never reads as the thing itself. */
export function code(text) {
  return text.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
}

/** 1 — the authority this checkpoint implements is accepted and locked. */
function checkAuthority(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  const register = read(rootDir, 'register') ?? '';
  for (const entry of [
    'APP3-G08 = COMPLETE — REVIEW_ACCEPTED',
    'IMP-D048 = LOCKED',
    'APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B',
    // Delivered or accepted: which review stage this checkpoint has reached is
    // a fact about the calendar, not about the retry semantics it locks.
    /\nAPP3-W01C = COMPLETE — REVIEW_(DELIVERED|ACCEPTED)\n/,
  ]) {
    const satisfied = entry instanceof RegExp ? entry.test(phase) : phase.includes(`\n${entry}\n`);
    if (!satisfied) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${String(entry)}"`);
    }
  }
  const row = register.split('\n').find((line) => line.startsWith('| IMP-D048 |'));
  if (row === undefined) {
    fail(`${CANONICAL_FILES.register}: IMP-D048 is missing`);
  } else if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: IMP-D048 is not LOCKED`);
  } else if (!row.includes('APP3-W01C')) {
    fail(`${CANONICAL_FILES.register}: IMP-D048 does not route the ordering fix to APP3-W01C`);
  }
}

/**
 * 2 — the transient set is exactly the one proven state. `UPLOADED` looks like
 * an obvious sibling of `INSPECTING` and cannot occur, because the producer
 * appends the event in the transaction that leaves it; admitting it would turn
 * a real defect into a silent retry loop.
 */
function checkTransientSet(rootDir, fail) {
  const pending = read(rootDir, 'pending');
  if (pending === undefined) {
    fail(`${CANONICAL_FILES.pending}: missing`);
    return;
  }
  const declared = /SESSION_TRANSIENT_ASSET_STATUSES[^=]*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(
    pending,
  );
  if (declared === null) {
    fail(`${CANONICAL_FILES.pending}: the transient status set is not a frozen literal`);
    return;
  }
  const statuses = [...declared[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
  if (statuses.length !== 1 || statuses[0] !== 'INSPECTING') {
    fail(
      `${CANONICAL_FILES.pending}: transient statuses are [${statuses.join(', ')}], expected exactly INSPECTING`,
    );
  }
}

/** 6 — the retry uses the existing taxonomy, and that class really is retryable. */
function checkRetrySignal(rootDir, fail) {
  const pending = read(rootDir, 'pending') ?? '';
  if (!/WorkerJobError\(\s*'JOB_TRANSIENT_FAILURE'/.test(code(pending))) {
    fail(`${CANONICAL_FILES.pending}: the retry is not raised as a JOB_TRANSIENT_FAILURE`);
  }
  if (!/from '\.\.\/\.\.\/\.\.\/runtime\/errors\/worker-job-error'/.test(pending)) {
    fail(`${CANONICAL_FILES.pending}: the error is not the runtime's own WorkerJobError`);
  }

  const errors = read(rootDir, 'errors') ?? '';
  const terminal = /const ALWAYS_TERMINAL[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(errors);
  if (terminal === null) {
    fail(`${CANONICAL_FILES.errors}: the always-terminal set could not be read`);
  } else if (terminal[1].includes('JOB_TRANSIENT_FAILURE')) {
    fail(`${CANONICAL_FILES.errors}: JOB_TRANSIENT_FAILURE became always-terminal — retry is dead`);
  }
  if (!/attemptNo >= maxAttempts \? 'TERMINAL' : 'RETRYABLE'/.test(errors)) {
    fail(`${CANONICAL_FILES.errors}: the existing attempt-cap disposition is gone`);
  }

  // Only the class is persisted and the message is read live, so no identity may
  // appear. The whole factory body is scanned, not a quoted literal: a template
  // string would slip past a `'...'` match precisely by being the interpolating form.
  const factory = /export function inspectionPendingFailure\(\)[\s\S]*?\n\}/.exec(code(pending));
  if (factory === null) {
    fail(`${CANONICAL_FILES.pending}: the retry factory could not be located`);
  } else if (/\$\{|`|assetId|sessionId|associationId|storage/i.test(factory[0])) {
    fail(`${CANONICAL_FILES.pending}: the retry message carries an identity`);
  }
}

/** 2, 3, 4, 5 — the branch is narrowed on profile and state; others stay terminal. */
function checkResolverNarrowing(rootDir, fail) {
  const resolver = read(rootDir, 'resolver');
  if (resolver === undefined) {
    fail(`${CANONICAL_FILES.resolver}: missing`);
    return;
  }
  const body = code(resolver);

  if (!/DESIGN_SESSION_ASSET'[\s\S]{0,120}isSessionInspectionPending/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: the retry is not narrowed to DESIGN_SESSION_ASSET`);
  }
  if (!/const REQUIRED_ASSET_STATUS = 'ACCEPTED';/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: ACCEPTED is no longer the status that proceeds`);
  }
  if (!/source\.status !== REQUIRED_ASSET_STATUS/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: the status comparison is gone`);
  }
  if (!/source === undefined \|\| source\.deleted/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: a missing or tombstoned Asset is no longer terminal`);
  }
  // Every terminal path still raises the single bounded code.
  const rejections =
    body.match(/normalizationRejection\('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE'\)/g) ?? [];
  if (rejections.length < 4) {
    fail(
      `${CANONICAL_FILES.resolver}: ${String(rejections.length)} terminal rejections, expected the four context paths`,
    );
  }
  // The lane check must precede the status check, so a wrong-lane Asset stays
  // terminal however it is being inspected.
  if (body.indexOf('LANE_BY_PROFILE[profile]') > body.indexOf('source.status !==')) {
    fail(`${CANONICAL_FILES.resolver}: the lane check no longer precedes the status check`);
  }
  if (/PRODUCT_SIDE_BACKGROUND[\s\S]{0,80}inspectionPendingFailure/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: the retry was widened to Product Side normalization`);
  }
  if (/DESIGN_TEMPLATE_ASSET[\s\S]{0,80}inspectionPendingFailure/.test(body)) {
    fail(`${CANONICAL_FILES.resolver}: the retry was widened to Template normalization`);
  }
}

/**
 * 8 — the refusal happens before the claim.
 *
 * This is the property that keeps a waiting attempt from leaving a `PROCESSING`
 * row: the resolve is step 1 and the claim is step 4, and nothing about the
 * retry may reorder them.
 */
function checkClaimOrder(rootDir, fail) {
  const useCase = read(rootDir, 'useCase');
  if (useCase === undefined) {
    fail(`${CANONICAL_FILES.useCase}: missing`);
    return;
  }
  const body = code(useCase);
  const resolveAt = body.indexOf('this.associations.resolve');
  const claimAt = body.indexOf('prepareOrRecover');
  if (resolveAt < 0 || claimAt < 0) {
    fail(`${CANONICAL_FILES.useCase}: the resolve or the claim could not be located`);
    return;
  }
  if (resolveAt > claimAt) {
    fail(`${CANONICAL_FILES.useCase}: the claim now precedes the context resolve`);
  }
  if (!/status = 'PROCESSING'/.test(read(rootDir, 'repository') ?? '')) {
    fail(`${CANONICAL_FILES.repository}: the claim release is no longer guarded on PROCESSING`);
  }
  // A retryable failure must stay a throw: turning it into a returned outcome
  // would complete the job and lose the attempt. Scoped to `normalize`'s own
  // catch — the finalize path rethrows too, and matching that one instead would
  // let this check pass while the runtime never saw a retry.
  const guard = /async normalize\([\s\S]*?\n {2}\}/.exec(body);
  if (guard === null) {
    fail(`${CANONICAL_FILES.useCase}: the normalize entry point could not be located`);
  } else if (
    !/isNormalizationRejection\(error\)/.test(guard[0]) ||
    !/throw error;/.test(guard[0])
  ) {
    fail(`${CANONICAL_FILES.useCase}: a non-verdict failure no longer propagates to the runtime`);
  }
}

/** 7 — no polling, sleeping, scheduler, queue, event or producer was added. */
function checkNoNewMechanism(rootDir, fail) {
  for (const key of [
    'pending',
    'resolver',
    'useCase',
    'handler',
    'outcome',
    'resolverSpec',
    'convergenceSpec',
  ]) {
    const text = code(read(rootDir, key) ?? '');
    for (const [pattern, what] of [
      [/setTimeout|setInterval|sleep\(|delay\(/, 'a sleep or polling primitive'],
      [/cron|scheduler|sweep/i, 'a scheduler, cron or sweep'],
      [/new Queue|createQueue/, 'a second queue'],
      [/outbox\.append|appendEvent\(/, 'an event append'],
    ]) {
      // The convergence suite legitimately reads the producer's event to prove
      // no second one was appended; only production sources are held to this.
      if (key.endsWith('Spec') && what === 'an event append') continue;
      if (pattern.test(text)) {
        fail(`${CANONICAL_FILES[key]}: introduces ${what}`);
      }
    }
  }
  const handler = code(read(rootDir, 'handler') ?? '');
  if (!/readonly jobKind = ASSET_PROCESSING;/.test(handler)) {
    fail(`${CANONICAL_FILES.handler}: the job kind changed`);
  }
}

/** 9 — the convergence the checkpoint exists for is actually proved. */
function checkConvergenceProved(rootDir, fail) {
  const spec = read(rootDir, 'convergenceSpec');
  if (spec === undefined) {
    fail(`${CANONICAL_FILES.convergenceSpec}: missing`);
    return;
  }
  for (const [pattern, what] of [
    [/JOB_TRANSIENT_FAILURE/, 'the retryable attempt'],
    [/'ACCEPTED'/, 'inspection completing'],
    [/'REJECTED'/, 'inspection refusing the file'],
    [/toHaveLength\(1\)/, 'exactly one derivative'],
    [/count.*'1'|'1'/, 'no second producer event'],
    [/delete from design_session_assets/, 'association removal while waiting'],
    [/PRODUCT_SIDE_BACKGROUND/, 'the Product Side narrowing'],
  ]) {
    if (!pattern.test(spec)) {
      fail(`${CANONICAL_FILES.convergenceSpec}: does not prove ${what}`);
    }
  }
  const unit = read(rootDir, 'resolverSpec') ?? '';
  if (!/dispositionOf\('JOB_TRANSIENT_FAILURE'/.test(unit)) {
    fail(`${CANONICAL_FILES.resolverSpec}: does not prove the runtime disposition of the signal`);
  }
}

/** 10, 13 — nothing outside the worker moved. */
function checkBoundary(rootDir, fail) {
  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('package.json: missing');
  } else {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPT_COUNT) {
      fail(`package.json: ${String(scripts.length)} root scripts, expected ${ROOT_SCRIPT_COUNT}`);
    }
    if (scripts.some((name) => name.includes('w01c'))) {
      fail('package.json: APP3-W01C added a root script');
    }
  }

  const worker = read(rootDir, 'workerManifest');
  if (worker !== undefined) {
    const parsed = JSON.parse(worker);
    const deps = { ...parsed.dependencies, ...parsed.devDependencies };
    for (const name of Object.keys(deps)) {
      if (/schedule|cron|bull|agenda|p-retry|async-retry/i.test(name)) {
        fail(`apps/worker/package.json: a retry or scheduling dependency was added (${name})`);
      }
    }
  }

  const migrations = join(rootDir, 'packages/database/migrations');
  if (existsSync(migrations)) {
    const count = readdirSync(migrations).filter((name) => name.endsWith('.sql')).length;
    if (count !== 34) {
      fail(`packages/database/migrations: ${String(count)} migrations, expected 34`);
    }
  }

  const openapi = read(rootDir, 'openapi') ?? '{}';
  const paths = Object.keys(JSON.parse(openapi).paths ?? {}).length;
  if (paths !== acceptedSurface(rootDir).paths) {
    fail(`${CANONICAL_FILES.openapi}: ${String(paths)} paths — W01C publishes no HTTP surface`);
  }

  for (const id of ['CMD-CHECK-APP3-W01C', 'CMD-TEST-APP3-W01C']) {
    if (!(read(rootDir, 'commandIndex') ?? '').includes(`\`${id}\``)) {
      fail(`${CANONICAL_FILES.commandIndex}: ${id} is not indexed`);
    }
  }
}

/** 12 — the successors this unblocks have not been started. */
function checkSuccessorsNotStarted(rootDir, fail) {
  if (acceptedSurface(rootDir).designSessionRoutes) return;
  const appModule = read(rootDir, 'apps/api/src/bootstrap/app.module.ts') ?? '';
  if (/DesignModule|DesignSessionAssetModule/.test(appModule)) {
    fail('apps/api/src/bootstrap/app.module.ts: a design module is composed — B06A/B06B started');
  }
  const openapi = read(rootDir, 'openapi') ?? '';
  if (openapi.includes('/public/design-sessions')) {
    fail(`${CANONICAL_FILES.openapi}: a design-session route exists — B06A/B06B/B07 started`);
  }
}

/** 14 — file sizes, application and tooling. */
function checkFileSizes(rootDir, fail) {
  for (const [key, cap] of [
    ['pending', SOURCE_LIMIT],
    ['resolver', SOURCE_LIMIT],
    ['resolverSpec', TEST_LIMIT],
    ['convergenceSpec', TEST_LIMIT],
    ['tools/check-app3-w01c.mjs', SOFT_CAP_CHECKER],
    ['tools/check-app3-w01c.test.mjs', SOFT_CAP_TEST],
  ]) {
    const text = read(rootDir, key);
    if (text === undefined) {
      fail(`${CANONICAL_FILES[key] ?? key}: missing`);
      continue;
    }
    const lines = text.split('\n').length;
    if (lines > cap) {
      fail(
        `${CANONICAL_FILES[key] ?? key}: ${String(lines)} lines, above the ${String(cap)} limit`,
      );
    }
  }
}

/** 14 — the report carries its execution evidence. */
function checkLedger(rootDir, fail) {
  const report = read(rootDir, 'report');
  if (report === undefined) return; // Commit A runs before the report exists.
  for (const [pattern, what] of [
    [/command ledger/i, 'the command ledger'],
    [/REUSED_RESULT_FROM/, 'the reused-result evidence'],
  ]) {
    if (!pattern.test(report)) {
      fail(`${CANONICAL_FILES.report}: does not record ${what}`);
    }
  }
}

/** 11 — the accepted predecessors still pass. */
function checkPredecessors(rootDir, fail) {
  const chain = {
    'APP3-G08': checkApp3G08,
    'APP3-W01A': checkApp3W01A,
    'APP3-W01B': checkApp3W01B,
    'APP3-G06': checkApp3G06,
  };
  for (const [label, run] of Object.entries(chain)) {
    const result = run(rootDir);
    for (const violation of Array.isArray(result) ? result : (result.failures ?? [])) {
      fail(`${label} regression: ${violation}`);
    }
  }
}

export function checkApp3W01C(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkAuthority(rootDir, fail);
  checkTransientSet(rootDir, fail);
  checkRetrySignal(rootDir, fail);
  checkResolverNarrowing(rootDir, fail);
  checkClaimOrder(rootDir, fail);
  checkNoNewMechanism(rootDir, fail);
  checkConvergenceProved(rootDir, fail);
  checkBoundary(rootDir, fail);
  checkSuccessorsNotStarted(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkLedger(rootDir, fail);
  checkPredecessors(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3W01C(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01c — ${String(failures.length)} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01c — a Design Session upload whose inspection has not finished is a retryable ' +
      'attempt rather than a verdict: the wait is narrowed to DESIGN_SESSION_ASSET and to the one ' +
      'proven transient status, so a rejected, deleted, tombstoned, wrong-lane or stale-association ' +
      'Asset stays terminal and Product Side and Template normalization are untouched; the signal ' +
      "is the runtime's own JOB_TRANSIENT_FAILURE under the existing backoff, lease and " +
      'dead-letter policy, with no scheduler, sweep, poll, sleep, second queue or second event; ' +
      'the refusal is raised before the derivative claim, so a waiting attempt leaves no ' +
      'PROCESSING row and destroys no winner’s bytes; the same event is proved to converge on ' +
      'exactly one READY NORMALIZED derivative after ACCEPTED and to terminate after REJECTED; ' +
      'and no API, schema, migration, dependency, HTTP surface or root script was added',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

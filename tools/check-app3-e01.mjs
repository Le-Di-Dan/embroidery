#!/usr/bin/env node
/**
 * `APP3-E01` — the cross-layer evidence gate.
 *
 * The ways a final evidence checkpoint ships looking right and being wrong:
 *
 * - **A follow-up is closed by prose.** "Measured and fine" in a report, with no
 *   number behind it, reads exactly like a measurement.
 * - **The rate guard is reopened for convenience.** The forged-`X-Forwarded-For`
 *   bypass this checkpoint closed is also the cheapest way to get Session
 *   capacity for a benchmark, so the fix has to be defended against its own
 *   harness.
 * - **A journey waits out a window.** A `sleep` long enough to clear an hourly
 *   limit turns an abuse control into a delay, and the run stops proving the
 *   control exists.
 * - **A fixture is not idempotent.** Two accepted runs that need manual SQL
 *   between them are one accepted run and a story about a second.
 * - **`APP3-X01` starts early.** A closure checkpoint that begins before its
 *   evidence is accepted is a phase closing on itself.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report:
 * every rule reads the phase status, the source, or an artifact — never a
 * report's prose.
 */
import { join } from 'node:path';

import {
  CANONICAL_FILES,
  DISPOSITIONS,
  EXPECTED_MIGRATIONS,
  EXPECTED_OPERATIONS,
  EXPECTED_PATHS,
  EXPECTED_SCHEMAS,
  MIGRATIONS,
  OWNED_FOLLOW_UPS,
  REPO_ROOT,
  ROOT_SCRIPTS,
  code,
  collect,
  harnessCode,
  read,
} from './check-app3-e01.sources.mjs';

/** The entry `APP3-E01` runs on top of, and the closure it may not start. */
export function checkEntry(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';

  for (const accepted of ['APP3-S10', 'APP3-S11']) {
    if (!new RegExp(`\\n${accepted} = COMPLETE — REVIEW_ACCEPTED`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${accepted} is not recorded as accepted`);
    }
  }
  if (!/\nAPP3-E01 = (READY — NOT STARTED|COMPLETE)/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-E01 is not recorded under a legitimate status`);
  }
  // The closure checkpoint may not begin before this one is accepted.
  if (/\nAPP3-X01 = (READY|COMPLETE)/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-X01 started before APP3-E01 was accepted`);
  }
  if (/\nAPP3 = CLOSED/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the phase was closed by a checkpoint that does not close it`);
  }
}

/**
 * The `X-Forwarded-For` trusted-hop rule, in both directions.
 *
 * The defect `APP3-E01` measured: the gateway appends with
 * `$proxy_add_x_forwarded_for`, and the key service read the **left-most**
 * entry — so a client's own header chose its rate bucket. With the burst
 * exhausted the honest caller got `429` and a forged `198.51.100.7` got `201`.
 *
 * Both halves are asserted, because either alone is satisfiable by a change that
 * reopens the hole: the service must take the entry the trusted hop wrote, and
 * the gateway must still be the appending hop the fix assumes.
 */
export function checkTrustedHop(rootDir, fail) {
  const service = code(rootDir, 'networkKey');

  if (/split\(','\)\[0\]/.test(service) || /const first = /.test(service)) {
    fail(`${CANONICAL_FILES.networkKey}: the network key is taken from the client's own entry`);
  }
  if (!/hops\[hops\.length - 1\]/.test(service)) {
    fail(`${CANONICAL_FILES.networkKey}: the network key is not the entry the trusted hop wrote`);
  }
  if (!/filter\(\(hop\) => hop\.trim\(\) !== ''\)/.test(service)) {
    fail(`${CANONICAL_FILES.networkKey}: an empty forwarded entry can still choose the bucket`);
  }
  // The assumption the fix rests on, asserted rather than trusted.
  const gateway = read(rootDir, 'proxyHeaders') ?? '';
  if (!/X-Forwarded-For \$proxy_add_x_forwarded_for/.test(gateway)) {
    fail(
      `${CANONICAL_FILES.proxyHeaders}: the gateway no longer appends, so "last" is not the hop`,
    );
  }
  // And the regression that proves it, in the accepted spec.
  const spec = read(rootDir, 'networkKeySpec') ?? '';
  for (const proof of [
    'takes the entry the trusted hop appended, not one the client chose',
    'gives a caller no way to mint a fresh bucket from its own header',
  ]) {
    if (!spec.includes(proof)) {
      fail(`${CANONICAL_FILES.networkKeySpec}: the forged-header regression "${proof}" is gone`);
    }
  }
}

/** Capacity comes from topology, never from a forged header or a real wait. */
export function checkCapacityMechanism(rootDir, fail) {
  const runners = code(rootDir, 'runners');
  const harness = harnessCode(rootDir);

  if (!/'--ip'/.test(runners)) {
    fail(`${CANONICAL_FILES.runners}: runner identities are not assigned addresses`);
  }
  if (!/RUNNER_IDENTITIES/.test(runners)) {
    fail(`${CANONICAL_FILES.runners}: the run has no declared isolated client identities`);
  }
  /*
   * The harness may not mint an identity with a header.
   *
   * This is the rule that defends the security fix against its own benchmark:
   * the cheapest way to get Session capacity is exactly the bypass this
   * checkpoint closed, and a harness that used it would leave the product fixed
   * and the evidence worthless.
   */
  const capacity = harnessCode(rootDir, { except: 'security' });
  for (const forged of ['X-Forwarded-For', 'x-forwarded-for']) {
    if (capacity.includes(forged)) {
      fail(`tools/smoke-app3-e01*: the harness sets ${forged}, which is the closed bypass`);
    }
  }
  /*
   * ...and exactly one place that must.
   *
   * A ban alone would delete the regression assertion along with the bypass, and
   * a fix nobody attacks is a fix nobody has tested. The security file is where
   * the attempt belongs, and it has to be there: the probe spends the honest
   * burst first, then asks for the bypass and requires `429`.
   */
  const security = code(rootDir, 'security');
  if (!/X-Forwarded-For/.test(security) || !/429/.test(security)) {
    fail(
      `${CANONICAL_FILES.security}: the forged-header bypass is never attempted or never refused`,
    );
  }
  // No real waiting for a window, anywhere in the harness.
  for (const wait of [/setTimeout\([^)]*6\d{4}/, /sleep\s+\d{2,}/, /CREATION_PAUSE/]) {
    if (wait.test(harness)) {
      fail(`tools/smoke-app3-e01*: the harness waits out a rate window (${String(wait)})`);
    }
  }
}

/** Fixture lifecycles restore what they seed, so two runs need no manual SQL. */
export function checkFixtureIdempotency(rootDir, fail) {
  for (const key of ['studioFixtures', 'benchFixtures']) {
    const source = read(rootDir, key) ?? '';
    const templateInsert = source.slice(
      source.indexOf('insert into design_templates'),
      source.indexOf('insert into design_template_versions'),
    );
    if (templateInsert === '') {
      fail(`${CANONICAL_FILES[key]}: no Template seed found`);
      continue;
    }
    if (/on conflict \(id\) do nothing/.test(templateInsert)) {
      fail(`${CANONICAL_FILES[key]}: a re-seed after a revert leaves the Template ARCHIVED`);
    }
    if (
      !/status = 'PUBLISHED'/.test(templateInsert) ||
      !/archived_at = null/.test(templateInsert)
    ) {
      fail(`${CANONICAL_FILES[key]}: the seed does not restore the state it intends`);
    }
  }
}

/** Every follow-up this checkpoint owns carries a disposition, and none is invented. */
export function checkFollowUps(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';

  /*
   * The follow-up register is append-per-checkpoint, not chronological: a
   * status written by `APP3-S06` can sit hundreds of lines BELOW one written by
   * `APP3-S11`, so neither "the first line" nor "the last line" is the current
   * word. Reading the first was the original defect here — it made three
   * mutations pass, because the rule was inspecting a status from two
   * checkpoints ago. The current word is the last line in which THIS checkpoint
   * speaks; a follow-up on which it has said nothing falls back to its last
   * line, which is what a reader would take as current.
   */
  const currentLine = (followUp) => {
    const rows = phase.split('\n').filter((row) => row.startsWith(`${followUp} =`));
    return rows.findLast((row) => row.includes('APP3-E01')) ?? rows.at(-1);
  };

  for (const followUp of OWNED_FOLLOW_UPS) {
    const line = currentLine(followUp);
    if (line === undefined) {
      fail(`${CANONICAL_FILES.phase}: ${followUp} carries no disposition`);
      continue;
    }
    if (!DISPOSITIONS.some((disposition) => line.includes(disposition))) {
      fail(`${CANONICAL_FILES.phase}: ${followUp} carries no recognised disposition`);
    }
  }

  /*
   * A closure needs the evidence that earned it, in the status rather than in a
   * report. Each pair below is "the claim, and the fact a reader cannot
   * recompute from the source".
   */
  const closures = [
    ['FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01', 'EXPECTED_BY_STATE_MACHINE'],
    ['FU-APP3-S01-FIXTURE-IDEMPOTENCY-01', 'no manual SQL'],
    ['FU-APP3-S11-BENCHMARK-01', 'p95'],
  ];
  for (const [followUp, evidence] of closures) {
    const line = currentLine(followUp) ?? '';
    if (line.includes('CLOSED_BY_APP3-E01') && !line.includes(evidence)) {
      fail(`${CANONICAL_FILES.phase}: ${followUp} is closed without its measured evidence`);
    }
  }
  // The transform budget may not be silently declared met.
  /*
   * The blocking finding cannot be softened into a note.
   *
   * `APP3-E01`'s whole output is evidence, and the most consequential piece is a
   * customer-visible defect it reproduced in every run. A later edit that
   * downgraded it to `OPEN — NONBLOCKING` would let `APP3-X01` close the phase
   * over it, so the disposition is asserted here and the reproduction with it.
   */
  /*
   * The defect blocks closure until it is actually repaired.
   *
   * Anchored to the DISPOSITION, not to any occurrence of the word: the line
   * also explains why it blocked, so a substring test stays true after the
   * status itself has been downgraded. The mutation test caught exactly that.
   *
   * Two words are legitimate and no third is. Before `APP3-E01-C1` the finding
   * blocks `APP3-X01`; after it, it is closed BY that correction — and
   * `checkRevisionSeam` below then requires the code that earned the closure, so
   * the word cannot be written without the fix behind it.
   */
  /*
   * Read as the LAST row, not as the last row naming this checkpoint.
   *
   * `currentLine` is right for a register where other checkpoints also speak,
   * but it has a hole this finding cannot afford: a row edited so that it no
   * longer names the checkpoint becomes invisible, and the rule silently falls
   * back to the superseded row above it — which still says BLOCKS_X01 and is
   * still green. The mutation test caught exactly that. For the one finding that
   * decides whether a phase may close, the current word is simply the last thing
   * written about it.
   */
  const seamRows = phase
    .split('\n')
    .filter((row) => row.startsWith('FU-APP3-UPLOAD-REVISION-SEAM-01 ='));
  const seam = seamRows.at(-1) ?? '';
  const blocking = /^FU-APP3-UPLOAD-REVISION-SEAM-01 = OPEN — BLOCKS_X01\b/.test(seam);
  const closed = /^FU-APP3-UPLOAD-REVISION-SEAM-01 = COMPLETE — CLOSED_BY_APP3-E01-C1\b/.test(seam);
  if (!blocking && !closed) {
    fail(`${CANONICAL_FILES.phase}: the upload revision-seam defect no longer blocks closure`);
  }
  if (!/409/.test(seam)) {
    fail(`${CANONICAL_FILES.phase}: the upload revision-seam defect names no measured refusal`);
  }

  const budget = currentLine('FU-APP3-TRANSFORM-BUDGET-01') ?? '';
  /*
   * Anchored on `APP3-E01` rather than on one closure word. A budget can be
   * disposed of as closed, as accepted debt, or as an investigation whose
   * question is answered, and every one of those is a claim about a number: the
   * failure this rule exists to catch is the phase saying the budget was looked
   * at without saying what was measured, or naming a cause without the run that
   * identifies it. Both engines are required because a desktop budget met on one
   * engine and unmeasured on the other has not been measured.
   */
  if (budget.includes('APP3-E01')) {
    for (const [needed, why] of [
      [/p95|\d+\/\d+/, 'measurements'],
      [/[Cc]hromium/, 'a Chromium run'],
      [/[Ww]ebKit/, 'a WebKit run'],
      [/ATTRIBUTION =/, 'an attribution'],
    ]) {
      if (!needed.test(budget)) {
        fail(`${CANONICAL_FILES.phase}: the transform budget is disposed of without ${why}`);
      }
    }
  }
}

/**
 * The revision seam `APP3-E01-C1` repaired (`FU-APP3-UPLOAD-REVISION-SEAM-01`).
 *
 * Both Session mutations are compare-and-set on one number: `APP3-B08` autosave
 * and `APP3-B06B` upload. The defect was structural rather than arithmetic —
 * each capability kept its **own** copy of the bootstrap revision and advanced
 * only that, so an upload left the next save presenting a superseded revision:
 * `409`, and a customer with one tab open shown a conflict with nobody.
 *
 * The rule is therefore about ownership, not about a call. It asserts there is
 * one authority, that both capabilities read and report to it, that neither has
 * grown a private copy back, and that the revision cannot move backward when an
 * older response lands last. Restoring any private copy is exactly how the
 * defect returns, and it is the mutation these rules are written against.
 */
export function checkRevisionSeam(rootDir, fail) {
  const authority = code(rootDir, 'revisionAuthority');
  const image = code(rootDir, 'imageHook');
  const save = code(rootDir, 'autosaveHook');
  const screen = code(rootDir, 'stageScreen');

  if (authority === '') {
    fail(`${CANONICAL_FILES.revisionAuthority}: the Session-revision authority is missing`);
    return;
  }
  // Monotonic: an older answer landing last may not lower the revision.
  if (!/next <= current\.current/.test(authority)) {
    fail(`${CANONICAL_FILES.revisionAuthority}: the revision can move backward`);
  }
  // Owned by a Session: a response for one may not raise the revision of another.
  if (!/forSession !== bound\.current\.sessionId/.test(authority)) {
    fail(`${CANONICAL_FILES.revisionAuthority}: another Session's revision can be adopted`);
  }

  // The handoff itself: what B06B returned reaches the authority S10 reads.
  if (!/sessionRevision\.adopt\(sessionId, accepted\.sessionRevision\)/.test(image)) {
    fail(`${CANONICAL_FILES.imageHook}: the revision B06B returned is not handed to the authority`);
  }
  if (!/expectedRevision: sessionRevision\.read\(\)/.test(image)) {
    fail(`${CANONICAL_FILES.imageHook}: an upload does not present the authority's revision`);
  }
  if (!/expectedRevision: sessionRevision\.read\(\)/.test(save)) {
    fail(`${CANONICAL_FILES.autosaveHook}: a save does not present the authority's revision`);
  }
  if (!/sessionRevision\.adopt\(sessionId, result\.snapshot\.revision\)/.test(save)) {
    fail(`${CANONICAL_FILES.autosaveHook}: a save's own revision is not handed to the authority`);
  }

  // No second copy, in either capability. `serverRevision`/`localRevision` were
  // the two private replicas the defect consisted of.
  for (const [key, source, replica] of [
    ['imageHook', image, /localRevision/],
    ['autosaveHook', save, /const serverRevision = useRef/],
  ]) {
    if (replica.test(source)) {
      fail(`${CANONICAL_FILES[key]}: a private revision copy has come back`);
    }
  }

  // One authority, created once, above the tier that swaps panels.
  if (!/useStudioSessionRevision\(snapshot\.sessionId, snapshot\.revision\)/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the Studio does not own one Session-revision authority`);
  }
  if ((screen.match(/sessionRevision,/g) ?? []).length < 2) {
    fail(`${CANONICAL_FILES.stageScreen}: the authority is not shared by both capabilities`);
  }

  // And the proof, cross-capability by construction: the suites that each
  // proved one half both passed while the customer's save was refused.
  const proof = read(rootDir, 'seamProof') ?? '';
  for (const required of [
    'is the one the next autosave presents, and the save is accepted',
    'is presented by the next upload too, so an upload after a save is not stale',
    'never moves the revision backward when an older answer lands last',
  ]) {
    if (!proof.includes(required)) {
      fail(`${CANONICAL_FILES.seamProof}: the seam proof "${required}" is gone`);
    }
  }
}

/** The artifacts a cross-layer evidence checkpoint must not move. */
export function checkImmutability(rootDir, fail) {
  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(openapi);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (total, path) => total + Object.keys(path).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  if (paths !== EXPECTED_PATHS) fail(`${CANONICAL_FILES.openapi}: ${String(paths)} paths`);
  if (operations !== EXPECTED_OPERATIONS) {
    fail(`${CANONICAL_FILES.openapi}: ${String(operations)} operations`);
  }
  if (schemas !== EXPECTED_SCHEMAS) fail(`${CANONICAL_FILES.openapi}: ${String(schemas)} schemas`);

  const migrations = collect(join(rootDir, MIGRATIONS), /\.sql$/).length;
  if (migrations !== EXPECTED_MIGRATIONS) {
    fail(
      `${MIGRATIONS}: ${String(migrations)} migrations, expected ${String(EXPECTED_MIGRATIONS)}`,
    );
  }
  const rootPackage = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  const scripts = Object.keys(rootPackage.scripts ?? {});
  if (scripts.length !== ROOT_SCRIPTS) {
    fail(`${CANONICAL_FILES.rootPackage}: ${String(scripts.length)} scripts`);
  }
  for (const name of scripts) {
    if (/e01/i.test(name)) {
      fail(`${CANONICAL_FILES.rootPackage}: "${name}" is a checkpoint command in the root package`);
    }
  }
}

/** The scoped commands, registered and discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const command of ['CMD-CHECK-APP3-E01', 'CMD-TEST-APP3-E01', 'CMD-JOURNEY-APP3-E01']) {
    if (!index.includes(`\`${command}\``)) {
      fail(`${CANONICAL_FILES.index}: ${command} is not registered`);
    }
  }
}

/** The retry investigation exists and reads its verdict off a timeline. */
export function checkRetryInvestigation(rootDir, fail) {
  const investigation = read(rootDir, 'retryInvestigation') ?? '';
  if (investigation === '') {
    fail(`${CANONICAL_FILES.retryInvestigation}: the S10 retry investigation is missing`);
    return;
  }
  for (const required of ['RETRY_TIMELINE_MS', 'ERROR_PAUSED', 'resumeMock.mock.calls.length']) {
    if (!investigation.includes(required)) {
      fail(`${CANONICAL_FILES.retryInvestigation}: the investigation proves nothing (${required})`);
    }
  }
  // It must run on injected time, never on a real wait.
  if (!investigation.includes('advance(')) {
    fail(`${CANONICAL_FILES.retryInvestigation}: the timeline is not measured on injected time`);
  }
}

export function checkApp3E01(rootDir, fail) {
  checkEntry(rootDir, fail);
  checkTrustedHop(rootDir, fail);
  checkCapacityMechanism(rootDir, fail);
  checkFixtureIdempotency(rootDir, fail);
  checkFollowUps(rootDir, fail);
  checkRevisionSeam(rootDir, fail);
  checkRetryInvestigation(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkImmutability(rootDir, fail);
}

const SUMMARY =
  'check:app3-e01 — the cross-layer evidence gate: APP3-S10 and APP3-S11 accepted and APP3-X01 ' +
  'not started; the ephemeral network key taken from the entry the trusted gateway hop appended ' +
  'rather than the one a client chose, with the appending gateway asserted and the forged-header ' +
  'regression present; Session capacity taken from assigned runner addresses rather than from a ' +
  'forged header or a real wait; Template fixtures that restore the state they seed, so two ' +
  'accepted runs need no manual SQL; every follow-up this checkpoint owns carrying a recognised ' +
  'disposition, and no closure claimed without the measurement that earned it; one shared ' +
  'Session-revision authority that both APP3-B06B uploads and APP3-S10 saves report to and read ' +
  'from, monotonic and owned by its Session, with neither capability keeping a private copy; ' +
  'the S10 retry ' +
  'investigation reading its verdict off an injected-time timeline; and an unchanged artifact ' +
  'set of 37 paths / 42 operations / 84 schemas, 34 migrations and 30 root scripts.';

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const failures = [];
  checkApp3E01(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(SUMMARY);
  }
}

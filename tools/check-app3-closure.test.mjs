#!/usr/bin/env node
/**
 * `APP3-X01` — mutation tests for the phase-closure gate.
 *
 * A closure gate's whole claim is that it would notice. Each case here breaks
 * exactly one thing the gate protects, in a throwaway copy of what it reads,
 * and requires the matching rule to fail. A rule that stays green on a mutated
 * tree was reading something other than what it names — which is precisely how
 * the `APP3-E01` gate came to resolve a downgraded finding against the wrong
 * line, and how this phase's status register came to hold two contradictory
 * "current" words for the same key.
 *
 * Every case asserts the gate is GREEN on the unmutated copy first, so a
 * "fails as expected" result cannot come from the copy being broken.
 *
 * Docker-free, network-free, database-free.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkApp3Closure, checkArtifacts } from './check-app3-closure.mjs';
import { CANONICAL_FILES, EXPECTED, REPORT_DIR, REPO_ROOT } from './check-app3-closure.sources.mjs';

/**
 * A throwaway copy of exactly what the gate reads: four named files, plus the
 * report directory as *names* — the gate asks which checkpoints executed, not
 * what each report says, so empty files answer the question it actually puts.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'app3-closure-gate-'));
  for (const relative of Object.values(CANONICAL_FILES)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target);
  }
  mkdirSync(join(root, REPORT_DIR), { recursive: true });
  const copied = new Set(Object.values(CANONICAL_FILES));
  for (const name of readdirSync(join(REPO_ROOT, REPORT_DIR))) {
    // The closure matrix itself lives in this directory and was copied whole
    // above; blanking it here would make every case fail for the wrong reason.
    if (copied.has(`${REPORT_DIR}/${name}`)) continue;
    writeFileSync(join(root, REPORT_DIR, name), '');
  }
  return root;
}

/** The artifacts as they really are — the baseline every case starts from. */
const MEASURED = Object.freeze({
  openapi: Object.freeze({
    paths: EXPECTED.openapiPaths,
    operations: EXPECTED.openapiOperations,
    schemas: EXPECTED.openapiSchemas,
    hash: EXPECTED.openapiHash,
  }),
  client: EXPECTED.clientHash,
  migrations: EXPECTED.migrations,
  fingerprint: EXPECTED.fingerprint,
});

function failuresOf(root, measured = MEASURED) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkApp3Closure(root, fail);
  checkArtifacts(root, measured, fail);
  return failures;
}

function edit(root, key, mutate) {
  const path = join(root, CANONICAL_FILES[key] ?? key);
  writeFileSync(path, mutate(readFileSync(path, 'utf8')));
}

/**
 * One case: the gate is green, one thing breaks, the gate goes red for the
 * stated reason. `expect` is matched against the joined failures so a case
 * cannot pass because some OTHER rule happened to fail on the mutated copy.
 */
function mutation(name, mutateRoot, expect) {
  test(name, () => {
    const root = fixture();
    assert.deepEqual(failuresOf(root), [], 'the unmutated copy must be green');
    const measured = mutateRoot(root) ?? MEASURED;
    const failures = failuresOf(root, measured);
    assert.ok(
      failures.some((failure) => expect.test(failure)),
      `expected a failure matching ${expect}\n  got: ${failures.join('\n       ') || '(none)'}`,
    );
  });
}

test('the happy world: APP3 closes PASS_WITH_FOLLOW_UPS with 11 owned follow-ups', () => {
  assert.deepEqual(failuresOf(fixture()), []);
});

// ---------------------------------------------------------------------------
// The closure register — one key, one current word.
// ---------------------------------------------------------------------------

mutation(
  'a second line for a register key is ambiguity, not an update',
  (root) =>
    edit(root, 'phase', (text) =>
      text.replace(
        'APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT\n```',
        'APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT\nAPP3-E01 = READY — NOT STARTED\n```',
      ),
    ),
  /APP3-E01 appears 2 times/,
);

mutation(
  'E01-C1 not accepted blocks closure',
  (root) =>
    edit(root, 'phase', (text) =>
      text.replace(
        'APP3-E01-C1 = COMPLETE — REVIEW_ACCEPTED\nFU-APP3',
        'APP3-E01-C1 = COMPLETE — REVIEW_DELIVERED\nFU-APP3',
      ),
    ),
  /APP3-E01-C1 = "COMPLETE — REVIEW_DELIVERED"/,
);

mutation(
  'the upload-revision finding reopened blocks closure',
  (root) =>
    edit(root, 'phase', (text) =>
      text.replace(
        'FU-APP3-UPLOAD-REVISION-SEAM-01 = COMPLETE — CLOSED_BY_APP3-E01-C1\nAPP4',
        'FU-APP3-UPLOAD-REVISION-SEAM-01 = OPEN — BLOCKS_X01\nAPP4',
      ),
    ),
  /upload-revision finding is blocking again|FU-APP3-UPLOAD-REVISION-SEAM-01 = "OPEN/,
);

mutation(
  'deleting the register leaves the gate with nothing to read, not with a pass',
  (root) =>
    edit(root, 'phase', (text) =>
      text.replace('### 10.1 APP3 closure register', '### 10.1 status'),
    ),
  /no fenced/,
);

// ---------------------------------------------------------------------------
// The checkpoint matrix.
// ---------------------------------------------------------------------------

mutation(
  'an executed checkpoint dropped from the matrix is noticed from the report directory',
  (root) =>
    edit(root, 'matrix', (text) =>
      text
        .split('\n')
        .filter((line) => !line.includes('`APP3-S09`'))
        .join('\n'),
    ),
  /APP3-S09 has a completion report but no closure-matrix row/,
);

mutation(
  'a checkpoint recorded as accepted without a commit is evidence described, not kept',
  (root) => edit(root, 'matrix', (text) => text.replace('| `6344a72` | `d122ab6` |', '| — | — |')),
  /APP3-S09 records no real implementation commit/,
);

mutation(
  'a checkpoint recorded as not accepted blocks closure',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace(
        '| `APP3-S11` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes |',
        '| `APP3-S11` | storefront | `COMPLETE — REVIEW_ACCEPTED` | no |',
      ),
    ),
  /APP3-S11 is recorded as not accepted/,
);

mutation(
  'the closure checkpoint must still record itself, un-accepted',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace(
        '| `APP3-X01` | `COMPLETE — DELIVERED_FOR_REVIEW` |',
        '| `APP3-X01` | `COMPLETE — REVIEW_ACCEPTED` |',
      ),
    ),
  /does not record APP3-X01 as delivered for review/,
);

mutation(
  'a ruled-out checkpoint on disk is not closed over',
  (root) => writeFileSync(join(root, REPORT_DIR, 'APP3-E01-C2-COMPLETION-REPORT.md'), ''),
  /APP3-E01-C2 was ruled out but has a completion report/,
);

mutation(
  'a cancelled correction may not be counted as delivered',
  (root) => edit(root, 'matrix', (text) => text.replaceAll('cancelled', 'delivered')),
  /does not reconcile the cancelled APP3-B06C-C1/,
);

// ---------------------------------------------------------------------------
// Follow-ups.
// ---------------------------------------------------------------------------

mutation(
  'an ownerless follow-up blocks closure',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace(
        '| `APP4` — owns customer identity, secure access and session lifecycle |',
        '| OWNER_NOT_YET_ASSIGNED |',
      ),
    ),
  /FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01 (is owned by|defers its owner)/,
);

mutation(
  'a blocking follow-up blocks closure',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('| environment robustness, nonblocking |', '| BLOCKS_X01 |'),
    ),
  /FU-APP3-WORKER-BOOT-ORDER-01 is recorded as blocking/,
);

mutation(
  'a follow-up deleted from the matrix is not thereby closed',
  (root) =>
    edit(root, 'matrix', (text) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('| `FU-APP3-CONFLICT-CODE-CONTRACT-01`'))
        .join('\n'),
    ),
  /FU-APP3-CONFLICT-CODE-CONTRACT-01 is open but has no closure-matrix row/,
);

mutation(
  'transform debt falsely closed fails',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('`OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT` — measured', '`CLOSED` — measured'),
    ),
  /no longer carried as explicit accepted phase debt/,
);

mutation(
  'transform debt that stops naming its measured numbers fails',
  (root) => edit(root, 'matrix', (text) => text.replaceAll('33.4', 'acceptable')),
  /no longer records its measured 33\.4 figure/,
);

// ---------------------------------------------------------------------------
// Capability honesty.
// ---------------------------------------------------------------------------

mutation(
  'group creation claimed as delivered fails',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace(
        'group creation               = NOT_DELIVERED — FU-APP3-S04-GROUP-AUTHORITY-01',
        'grouping                     = APP3-S04',
      ),
    ),
  /does not record that "group creation" is not delivered/,
);

mutation(
  'a capability with no delivering checkpoint fails',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('| Runtime watermark | `APP3-S09` |', '| Runtime watermark | delivered |'),
    ),
  /"Runtime watermark" names no delivering checkpoint/,
);

mutation(
  'a production-readiness claim fails — IMP-D015 reserves it for APP12',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('## 8. Handoff', '## 8. Handoff\n\nAPP3 is production-ready.\n'),
    ),
  /production-readiness claim/,
);

// ---------------------------------------------------------------------------
// Verdict, artifacts and the next phase.
// ---------------------------------------------------------------------------

mutation(
  'PASS while follow-ups remain open fails',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('APP3_VERDICT = PASS_WITH_FOLLOW_UPS', 'APP3_VERDICT = PASS'),
    ),
  /verdict is PASS while 11 follow-ups remain open/,
);

mutation(
  'a nonzero blocking count fails',
  (root) =>
    edit(root, 'matrix', (text) =>
      text.replace('APP3_BLOCKING_FOLLOW_UPS = 0', 'APP3_BLOCKING_FOLLOW_UPS = 1'),
    ),
  /states 1 blocking follow-ups; closure requires 0/,
);

mutation(
  'artifact drift blocks closure',
  () => ({ ...MEASURED, migrations: EXPECTED.migrations + 1 }),
  /frozen migration count drifted/,
);

mutation(
  'a matrix that stops recording a frozen artifact cannot be audited',
  (root) => edit(root, 'matrix', (text) => text.replaceAll(EXPECTED.openapiHash, '(unchanged)')),
  /does not record the frozen OpenAPI hash/,
);

mutation(
  'APP4 started early blocks closure',
  (root) => writeFileSync(join(root, REPORT_DIR, 'APP4-B01-COMPLETION-REPORT.md'), ''),
  /APP4 has started before APP3 closed/,
);

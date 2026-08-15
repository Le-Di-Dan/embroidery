/**
 * Tests for the `APP4-X01` closure gate.
 *
 * Each case builds a synthetic world on disk and runs the real evaluator over
 * it. A gate is only worth committing if it *rejects*, so most of these worlds
 * are deliberately wrong: a stale endpoint count, a returned `/retry`, a missing
 * R01-C1, an ownerless follow-up. Mutating the real repository to prove that
 * would be both destructive and unrepeatable.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';

import { evaluate, APP4_BASELINE } from './check-app4-closure.mjs';

const OPENAPI_PATH = 'packages/contracts/openapi/openapi.generated.json';

/** The committed artifact, so the hash the gate checks is the real one. */
const REAL_OPENAPI = join(process.cwd(), OPENAPI_PATH);

function write(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** A matrix that satisfies every rule; each case then breaks exactly one. */
function happyMatrix(overrides = {}) {
  const {
    featureEndpointNote = '11',
    e01Status = 'PASS_AFTER_R01_C1',
    blocking = 0,
    nonblocking = 9,
    ownerless = 0,
    app5 = 'APP5 = NOT_STARTED',
    extra = '',
    b08Closure = 'CLOSED_BY_R01_C1',
  } = overrides;
  return [
    '# APP4 closure matrix',
    ...[
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
    ].map((id) => `| ${id} | delivered |`),
    '| APP4-E01-H01 | PASS | APP4-E01-H02 | PASS |',
    '| APP4-E01-R01 | PASS_AFTER_C1 | APP4-E01-R01-C1 | PASS |',
    `APP4-E01 = ${e01Status}`,
    `feature endpoints = ${featureEndpointNote}`,
    'Gate 1 Gate 2 Gate 3 Gate 4 Gate 5 mapped to accepted evidence',
    `FU-APP4-B08-WORKER-JOURNEY-01 | ${b08Closure}`,
    '| `IMP-O006` | nonblocking | **APP12 — Hardening, UAT and Production Readiness** |',
    '```text',
    `blocking follow-ups    = ${blocking}`,
    `nonblocking follow-ups = ${nonblocking}`,
    `ownerless follow-ups   = ${ownerless}`,
    '```',
    app5,
    '**No `APP4-A01-C2`. No `APP4-E01-R01-C2`.**',
    `NO_APP4_MIGRATION = true`,
    `tables            = ${APP4_BASELINE.database.tables}`,
    `migrations        = ${APP4_BASELINE.database.migrations}`,
    APP4_BASELINE.database.latestMigration,
    APP4_BASELINE.generatedClientTreeHash,
    extra,
  ].join('\n');
}

function figmaIndex({ d01 = 30, a01 = 18 } = {}) {
  const rows = [];
  for (let i = 0; i < d01; i += 1) rows.push(`| row-${i} | FIG-APPROVAL-APP4-D01-PO-001 |`);
  for (let i = 0; i < a01; i += 1) {
    rows.push(`| a01-${i} | FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001 |`);
  }
  return ['# Figma index', ...rows].join('\n');
}

/** Builds a world; `mutate` may adjust it before evaluation. */
function buildWorld(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'app4-closure-'));
  write(root, 'docs/implementation/reports/APP4-CLOSURE-MATRIX.md', happyMatrix());
  write(root, 'docs/design/FIGMA_DESIGN_INDEX.md', figmaIndex());
  write(
    root,
    'docs/implementation/reports/APP4-E01-R01-C1-COMPLETION-REPORT.md',
    'replayWorkerClaimedNewOutbox = true\nreplayDeliveryRecorded = true\nexpiredCodeEqualsUnknown = true\n',
  );
  mkdirSync(join(root, dirname(OPENAPI_PATH)), { recursive: true });
  writeFileSync(join(root, OPENAPI_PATH), readFileSync(REAL_OPENAPI));
  mutate(root);
  return root;
}

function run(root) {
  const read = (relative) => {
    const path = join(root, relative);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  };
  return evaluate({
    root,
    matrix: read('docs/implementation/reports/APP4-CLOSURE-MATRIX.md'),
    figma: read('docs/design/FIGMA_DESIGN_INDEX.md'),
    openapiRaw: existsSync(join(root, OPENAPI_PATH))
      ? readFileSync(join(root, OPENAPI_PATH))
      : undefined,
    reports: (name) => read(`docs/implementation/reports/${name}`),
    reportExists: (name) => existsSync(join(root, `docs/implementation/reports/${name}`)),
  });
}

function withWorld(mutate, assertion) {
  const root = buildWorld(mutate);
  try {
    assertion(run(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the happy world closes with follow-ups', () => {
  withWorld(
    () => {},
    (result) => {
      assert.deepEqual(result.failures, []);
      assert.equal(result.verdict, 'PASS_WITH_FOLLOW_UPS');
      assert.equal(result.facts.featureEndpoints, 11);
      assert.equal(result.facts.b07Endpoints, 4);
    },
  );
});

test('zero follow-ups closes as a plain PASS', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ nonblocking: 0 }),
      ),
    (result) => {
      assert.deepEqual(result.failures, []);
      assert.equal(result.verdict, 'PASS');
    },
  );
});

test('a blocking follow-up blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ blocking: 1 }),
      ),
    (result) => {
      assert.equal(result.verdict, 'BLOCKED');
      assert.ok(result.failures.some((f) => f.startsWith('blocking-follow-up')));
    },
  );
});

test('an ownerless follow-up blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ ownerless: 1 }),
      ),
    (result) => {
      assert.equal(result.verdict, 'BLOCKED');
      assert.ok(result.failures.some((f) => f.startsWith('ownerless-follow-up')));
    },
  );
});

test('a vague owner blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ extra: '| FU-APP4-X | nonblocking | TBD | later |' }),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('vague-owner')));
    },
  );
});

test('a missing R01-C1 report blocks closure', () => {
  withWorld(
    (root) =>
      rmSync(join(root, 'docs/implementation/reports/APP4-E01-R01-C1-COMPLETION-REPORT.md')),
    (result) => {
      assert.equal(result.verdict, 'BLOCKED');
      assert.ok(result.failures.some((f) => f.startsWith('r01-c1')));
    },
  );
});

test('an R01-C2 is rejected outright', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-E01-R01-C2-COMPLETION-REPORT.md',
        'forbidden second correction',
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('r01-c2')));
    },
  );
});

test('reopening the replay-through-worker follow-up blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ b08Closure: 'OPEN' }),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('b08-followup')));
    },
  );
});

test('a missing expired-grant proof blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-E01-R01-C1-COMPLETION-REPORT.md',
        'replayWorkerClaimedNewOutbox = true\nreplayDeliveryRecorded = true\n',
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('expired-rejection')));
    },
  );
});

test('a missing replay-delivery proof blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-E01-R01-C1-COMPLETION-REPORT.md',
        'expiredCodeEqualsUnknown = true\n',
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('replay-through-worker')));
    },
  );
});

test('an APP5 that has started fails closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ app5: 'APP5 = IN_PROGRESS' }),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('app5')));
    },
  );
});

test('a falsely selected provider fails closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix({ extra: 'provider selected = true' }),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('provider-claim')));
    },
  );
});

test('a violated NO_APP4_MIGRATION fails closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix().replace('NO_APP4_MIGRATION = true', 'NO_APP4_MIGRATION = false'),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('no-app4-migration')));
    },
  );
});

test('Figma row drift fails closure', () => {
  withWorld(
    (root) => write(root, 'docs/design/FIGMA_DESIGN_INDEX.md', figmaIndex({ d01: 29 })),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('figma')));
    },
  );
});

test('a stale generated-client hash fails closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix().replace(APP4_BASELINE.generatedClientTreeHash, 'deadbeef'),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('generated-client')));
    },
  );
});

test('a missing canonical checkpoint blocks closure', () => {
  withWorld(
    (root) =>
      write(
        root,
        'docs/implementation/reports/APP4-CLOSURE-MATRIX.md',
        happyMatrix().replace('| APP4-B06 | delivered |', ''),
      ),
    (result) => {
      assert.ok(result.failures.some((f) => f.startsWith('canonical-checkpoints')));
    },
  );
});

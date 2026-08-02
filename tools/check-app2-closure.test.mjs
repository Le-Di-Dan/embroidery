/**
 * Regressions for the `APP2-X01` closure checker.
 *
 * Each case rehearses a specific way a closed phase could be quietly reopened,
 * hollowed out or misdescribed, and proves the checker refuses it. The current
 * repository passing is necessary but not interesting on its own — a checker
 * that only ever says yes is indistinguishable from no checker at all.
 *
 * The mutations run against a temporary copy of the canonical files, so no test
 * here writes into the repository.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  EXPECTED,
  FORBIDDEN_CHECKPOINTS,
  REPO_ROOT,
  checkApp2Closure,
  checkpointRows,
  dispatchedPublicationClaims,
  falseNotFoundClaims,
  followUpRows,
  measureFrozenArtifacts,
  tableRows,
} from './check-app2-closure.mjs';

const MATRIX = join(REPO_ROOT, CANONICAL_FILES.matrix);
const matrixText = readFileSync(MATRIX, 'utf8');

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway root carrying the real artifacts plus a mutated document.
 *
 * The frozen-artifact checks read real files, so those are copied rather than
 * faked: a fixture that invents its own OpenAPI would prove the checker can
 * compare two things this test wrote, which is not the question.
 */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app2-closure-'));
  temporaries.push(dir);
  for (const relative of [
    'packages/contracts/openapi',
    'packages/api-client/src/generated',
    'packages/database/migrations',
    'packages/database/tools',
    'docs/design',
    'docs/implementation/reports',
    'docs/implementation/phases',
  ]) {
    mkdirSync(join(dir, relative), { recursive: true });
  }
  for (const relative of [
    'packages/contracts/openapi/openapi.generated.json',
    'packages/api-client/src/generated',
    'packages/database/migrations',
    'docs/design/FIGMA_DESIGN_INDEX.md',
    'docs/implementation/reports',
    CANONICAL_FILES.phase,
    CANONICAL_FILES.roadmap,
  ]) {
    cpSync(join(REPO_ROOT, relative), join(dir, relative), { recursive: true });
  }
  cpSync(
    join(REPO_ROOT, 'packages/database/tools/canonical-fingerprint.txt'),
    join(dir, 'packages/database/tools/canonical-fingerprint.txt'),
  );
  for (const [relative, text] of Object.entries(edits)) {
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

/** Failures produced by a single edit to the closure matrix. */
async function failuresAfter(replace, by) {
  assert.ok(matrixText.includes(replace), `matrix is missing the anchor: ${replace.slice(0, 60)}`);
  const dir = rootWith({ [CANONICAL_FILES.matrix]: matrixText.replace(replace, by) });
  return checkApp2Closure(dir);
}

describe('APP2 closure — the repository as it stands', () => {
  it('passes', async () => {
    assert.deepEqual(await checkApp2Closure(REPO_ROOT), []);
  });

  it('reconciles 30 canonical checkpoints across 45 rows', () => {
    const rows = checkpointRows(matrixText);
    assert.equal(rows.length, 45);
    const corrections = rows.filter((row) => row.corrections === '—');
    assert.equal(rows.length - corrections.length + 1, 30, 'parents plus APP2-X01 itself');
  });

  it('routes eleven follow-ups, every one nonblocking and owned', () => {
    const rows = followUpRows(matrixText);
    assert.equal(rows.length, 11);
    assert.equal(
      rows.filter((row) => row.blocking === 'NONBLOCKING').length,
      11,
      'no blocking follow-up may survive closure',
    );
    assert.ok(rows.every((row) => row.owner.length > 0));
    assert.equal(
      rows.filter((row) => /APP1/.test(row.id) || /APP1/.test(row.origin)).length,
      2,
      'inherited from APP1',
    );
  });

  it('measures the frozen artifacts rather than trusting the matrix', async () => {
    const measured = await measureFrozenArtifacts(REPO_ROOT);
    assert.equal(measured.openapi.hash, EXPECTED.openapiHash);
    assert.equal(measured.openapi.paths, EXPECTED.openapiPaths);
    assert.equal(measured.openapi.operations, EXPECTED.openapiOperations);
    assert.equal(measured.openapi.schemas, EXPECTED.openapiSchemas);
    assert.equal(measured.client, EXPECTED.clientHash);
    assert.equal(measured.migrations, EXPECTED.migrations);
    assert.equal(measured.fingerprint, EXPECTED.fingerprint);
    assert.equal(measured.figma.registryIds, EXPECTED.figmaIds);
    assert.equal(measured.figma.nodeRows, EXPECTED.figmaNodeRows);
    assert.equal(measured.figma.tables, EXPECTED.figmaTables);
  });
});

describe('APP2 closure — a checkpoint reopens', () => {
  it('rejects a checkpoint whose status is no longer final', async () => {
    const failures = await failuresAfter(
      '| APP2-S02 | Storefront Product Detail at `/san-pham/[slug]` | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW',
      '| APP2-S02 | Storefront Product Detail at `/san-pham/[slug]` | BLOCKED_BY_UI03_RECONCILIATION',
    );
    assert.ok(failures.some((line) => line.includes('APP2-S02') && line.includes('not final')));
  });

  it('rejects a blocking checkpoint even when its status reads COMPLETE', async () => {
    const failures = await failuresAfter(
      '| APP2-B04-COMPLETION-REPORT.md | NONE | 1 |',
      '| APP2-B04-COMPLETION-REPORT.md | BLOCKED_BY_PUBLIC_MEDIA | 1 |',
    );
    assert.ok(failures.some((line) => line.includes('APP2-B04') && line.includes('is blocking')));
  });

  it('rejects an E01 that is no longer the corrected one', async () => {
    const failures = await failuresAfter(
      '| APP2-E01 | publication cross-layer journey | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW',
      '| APP2-E01 | publication cross-layer journey | COMPLETE — DELIVERED_FOR_REVIEW',
    );
    assert.ok(failures.some((line) => line.includes('APP2-E01 must be')));
  });
});

describe('APP2 closure — evidence disappears', () => {
  it('rejects a row whose report does not exist', async () => {
    const failures = await failuresAfter(
      'APP2-W01-COMPLETION-REPORT.md',
      'APP2-W01-REPORT-THAT-WAS-NEVER-WRITTEN.md',
    );
    assert.ok(failures.some((line) => line.includes('names a report that does not exist')));
  });

  it('rejects an abbreviated commit hash', async () => {
    const failures = await failuresAfter('`c672236015bd42397ca7bd7e0a6faa96c388456b`', '`c672236`');
    assert.ok(failures.some((line) => line.includes('is not a full hash')));
  });

  it('rejects a matrix with the checkpoint table emptied', async () => {
    const start = matrixText.indexOf('| APP2-PRE-AUDIT |');
    const end = matrixText.indexOf('`Corr.` counts');
    const dir = rootWith({
      [CANONICAL_FILES.matrix]: matrixText.slice(0, start) + matrixText.slice(end),
    });
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('checkpoint row(s)')));
  });

  it('rejects a missing matrix outright', async () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.matrix), { force: true });
    const failures = await checkApp2Closure(dir);
    assert.deepEqual(failures.length, 1);
    assert.ok(failures[0].includes('canonical closure matrix is missing'));
  });
});

describe('APP2 closure — a forbidden checkpoint appears', () => {
  it('names every ruled-out checkpoint', () => {
    for (const id of ['APP2-S02-C2', 'APP2-E01-C2', 'APP2-D04', 'APP2-S01-C1']) {
      assert.ok(FORBIDDEN_CHECKPOINTS.includes(id), `${id} must stay forbidden`);
    }
  });

  it('rejects a C2 row', async () => {
    const failures = await failuresAfter(
      '| APP2-E01-C1 | canonical migration path for the disposable topology |',
      '| APP2-E01-C2 | a second correction nobody authorised | COMPLETE | `20a4e4b0fa9f56fce89b89ba0cb7b07e8e37860f` | `377321fdb2f065b3d229c863b26cc29e9425d7d0` | — | APP2-E01-C1-CORRECTION-REPORT.md | NONE | 0 |\n| APP2-E01-C1 | canonical migration path for the disposable topology |',
    );
    assert.ok(failures.some((line) => line.includes('APP2-E01-C2 must not exist')));
  });

  it('rejects a C2 report on disk even with no matrix row', async () => {
    const dir = rootWith();
    writeFileSync(
      join(dir, 'docs/implementation/reports/APP2-S02-C2-CORRECTION-REPORT.md'),
      '# stray\n',
      'utf8',
    );
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('APP2-S02-C2 must not exist')));
  });
});

describe('APP2 closure — a follow-up is weakened', () => {
  it('rejects a blocking follow-up', async () => {
    const failures = await failuresAfter(
      '| ROUTED — NONBLOCKING_FOR_A04 | NONBLOCKING |',
      '| ROUTED — NONBLOCKING_FOR_A04 | BLOCKING |',
    );
    assert.ok(failures.some((line) => line.includes('closure needs NONBLOCKING')));
  });

  it('rejects a follow-up whose owner disappeared', async () => {
    const failures = await failuresAfter(
      '| NONBLOCKING | framework tracking (Next.js) |',
      '| NONBLOCKING | — |',
    );
    assert.ok(failures.some((line) => line.includes('has no owner')));
  });

  it('rejects an empty follow-up register', async () => {
    const start = matrixText.indexOf('| FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01');
    const end = matrixText.indexOf('**Totals:**');
    const dir = rootWith({
      [CANONICAL_FILES.matrix]: matrixText.slice(0, start) + matrixText.slice(end),
    });
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('follow-up register is empty')));
  });
});

describe('APP2 closure — the verdict or surface drifts', () => {
  it('rejects a matrix that drops the phase verdict', async () => {
    const failures = await failuresAfter(EXPECTED.phaseVerdict, 'COMPLETE');
    assert.ok(failures.some((line) => line.includes('APP2 verdict')));
  });

  it('rejects a drifted public route', async () => {
    const failures = await failuresAfter('| Public routes | `/kham-pha`', '| Public routes | `/`');
    assert.ok(failures.some((line) => line.includes('/kham-pha is missing from')));
  });

  it('rejects a drifted frozen hash', async () => {
    const failures = await failuresAfter(EXPECTED.openapiHash, 'a'.repeat(64));
    assert.ok(failures.some((line) => line.includes('does not record the frozen OpenAPI hash')));
  });

  it('rejects a drifted frozen count', async () => {
    const failures = await failuresAfter(
      '| Tables / columns / CHECKs | 78 / 833 / 190 |',
      '| Tables / columns / CHECKs | 78 / 999 / 190 |',
    );
    assert.ok(failures.some((line) => line.includes('frozen column count')));
  });

  it('rejects an artifact that actually changed under a matrix that still claims the old hash', async () => {
    const dir = rootWith();
    const openapi = join(dir, 'packages/contracts/openapi/openapi.generated.json');
    const document = JSON.parse(readFileSync(openapi, 'utf8'));
    document.paths['/api/public/products/{slug}/invented'] = { get: {} };
    writeFileSync(openapi, JSON.stringify(document), 'utf8');
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('frozen OpenAPI hash drifted')));
    assert.ok(failures.some((line) => line.includes('frozen OpenAPI paths drifted')));
  });
});

describe('APP2 closure — a preserved boundary is misdescribed', () => {
  it('rejects calling the streamed not-found an exact 404', () => {
    assert.equal(
      falseNotFoundClaims('The streamed not-found now answers a real HTTP 404.').length,
      1,
    );
    // Historical and prohibitive lines stay legal.
    assert.equal(
      falseNotFoundClaims('Historically the streamed route was expected to answer 404.').length,
      0,
    );
  });

  it('rejects claiming the publication events were dispatched', () => {
    assert.equal(
      dispatchedPublicationClaims('The product.published events are now dispatched.').length,
      1,
    );
    assert.equal(
      dispatchedPublicationClaims('Publication outbox events remain PENDING; DISPATCHED = 0.')
        .length,
      0,
    );
  });

  it('fails the whole check when the matrix marks publication events dispatched', async () => {
    // The whole cell is replaced, not a phrase inside it: a line that still
    // says `DISPATCHED = 0` is not claiming dispatch, and the checker is right
    // to leave it alone.
    const cell = matrixText
      .split('\n')
      .find((line) => line.startsWith('| publication Outbox consumer |'));
    assert.ok(cell !== undefined);
    const failures = await failuresAfter(
      cell,
      '| publication Outbox consumer | the publication Outbox events were dispatched to their consumer. |',
    );
    assert.ok(failures.some((line) => line.includes('dispatched or consumed')));
  });

  it('rejects dropping SAFE_STREAMED_NOT_FOUND from the record', async () => {
    const dir = rootWith({
      [CANONICAL_FILES.matrix]: matrixText.replaceAll(EXPECTED.notFoundAuthority, 'NOT_FOUND'),
    });
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('no longer recorded')));
  });
});

describe('APP2 closure — the next phase starts early', () => {
  it('rejects an APP3 report on disk', async () => {
    const dir = rootWith();
    writeFileSync(
      join(dir, 'docs/implementation/reports/APP3-D01-COMPLETION-REPORT.md'),
      '# early\n',
      'utf8',
    );
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('must not be started before closure')));
  });

  it('permits the APP3 pre-implementation audit report, which post-dates closure', async () => {
    const dir = rootWith();
    writeFileSync(
      join(dir, 'docs/implementation/reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md'),
      '# audit\n',
      'utf8',
    );
    const failures = await checkApp2Closure(dir);
    assert.ok(!failures.some((line) => line.includes('must not be started before closure')));
  });

  it('still rejects an APP3 report whose name only resembles the audit report', async () => {
    const dir = rootWith();
    writeFileSync(
      join(dir, 'docs/implementation/reports/APP3-PRE-IMPLEMENTATION-AUDIT-C1-REPORT.md'),
      '# not the audit\n',
      'utf8',
    );
    const failures = await checkApp2Closure(dir);
    assert.ok(failures.some((line) => line.includes('must not be started before closure')));
  });

  it('rejects a matrix that no longer records APP3 as not started', async () => {
    const failures = await failuresAfter('READY — NOT STARTED', 'IN PROGRESS');
    assert.ok(failures.some((line) => line.includes('READY — NOT STARTED')));
  });
});

describe('APP2 closure — table parsing', () => {
  it('stops at the next heading instead of swallowing later tables', () => {
    const rows = tableRows(matrixText, '## 3. Frozen artifact baseline');
    assert.ok(rows.length > 0);
    assert.ok(!rows.some((cells) => cells[0].startsWith('FU-')));
    assert.ok(!rows.some((cells) => cells[0].startsWith('APP2-')));
  });

  it('ignores the header and separator rows', () => {
    assert.ok(!checkpointRows(matrixText).some((row) => row.id === 'Checkpoint'));
    assert.ok(!followUpRows(matrixText).some((row) => row.id === 'ID'));
  });
});

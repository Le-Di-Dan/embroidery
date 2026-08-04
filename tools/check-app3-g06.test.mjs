/**
 * Regressions for the `APP3-G06` gate.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it.
 *
 * The cases worth reading twice are the ones that make the *next* checkpoint
 * easier: a polling sweep, a profile flag in the payload, a persisted profile
 * column, a sanitizer picked in passing, SVG quietly dropped because nothing can
 * implement it yet. Each would let `APP3-W01A` start sooner, and each would undo
 * the reason `APP3-G06` exists — which is exactly why an authority gate has to
 * assert its negations rather than only its rulings.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as B01_FILES } from './check-app3-b01.mjs';
import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, DECISION_ID, REPO_ROOT, checkApp3G06 } from './check-app3-g06.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-G06` chains B01 → P02 → G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01,
 * so the root needs every canonical file those gates read plus real `.git`
 * history for G01's chronology half. The two application source trees are copied
 * because the no-implementation check walks them: without them it would pass
 * vacuously, which is the one way this gate could be worthless.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-g06-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(B01_FILES),
    ...Object.values(P02_FILES),
    ...Object.values(G05_FILES),
    ...Object.values(DB01_FILES),
    ...Object.values(G01_FILES),
    ...Object.values(G02_FILES),
    ...Object.values(G03_FILES),
    ...Object.values(G04_FILES),
    ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
    `${FONT_DIR}/.gitattributes`,
    `${DOCUMENT_PACKAGE}/package.json`,
  ]);
  for (const relative of canonical) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  for (const directory of [
    'apps/api/src',
    'apps/worker/src',
    'packages/design-engine/src',
    DOCUMENT_SRC,
    'packages/database/migrations',
    '.git',
  ]) {
    cpSync(join(REPO_ROOT, directory), join(base, directory), { recursive: true });
  }
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checkApp3G06(dir);
  } finally {
    for (const relative of touched) {
      const source = join(REPO_ROOT, relative);
      try {
        cpSync(source, join(dir, relative));
      } catch {
        // The case created a file the repository does not have; remove it.
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const phase = () => read(CANONICAL_FILES.phase);
const register = () => read(CANONICAL_FILES.register);
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP3-G06 — the delivered authority passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3G06(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-G06 — the decision itself', () => {
  it('rejects a missing decision', () => {
    const failures = run({
      [CANONICAL_FILES.register]: register()
        .split('\n')
        .filter((line) => !line.startsWith(`| ${DECISION_ID} |`))
        .join('\n'),
    });
    assert.ok(mentions(failures, `${DECISION_ID} is missing`), failures.join('\n'));
  });

  it('rejects a duplicated decision', () => {
    const lines = register().split('\n');
    const row = lines.find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = run({
      [CANONICAL_FILES.register]: `${register()}\n${row}`,
    });
    assert.ok(mentions(failures, 'is declared 2 times'), failures.join('\n'));
  });

  it('rejects a decision that is not LOCKED', () => {
    const failures = run({
      [CANONICAL_FILES.register]: register().replace(
        /(\| IMP-D046 \|[\s\S]*?)\| LOCKED \|/,
        '$1| PROPOSED |',
      ),
    });
    assert.ok(mentions(failures, 'is not LOCKED'), failures.join('\n'));
  });

  it('rejects a decision missing one of the twelve rulings', () => {
    const failures = run({
      [CANONICAL_FILES.register]: register().replace('**(PO-09)', '**(PO-XX)'),
    });
    assert.ok(mentions(failures, 'does not record ruling PO-09'), failures.join('\n'));
  });
});

describe('APP3-G06 — the event vocabulary', () => {
  it('rejects repurposing the accepted inspection event', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '`asset.inspection.requested` is unchanged and never repurposed.',
        'We repurpose asset.inspection.requested for normalization.',
      ),
    });
    assert.ok(mentions(failures, 'repurpose'), failures.join('\n'));
  });

  it('rejects renaming the normalization event', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll(
        'asset.normalization.requested',
        'asset.editorsafe.queued',
      ),
    });
    assert.ok(mentions(failures, 'New normalization event'), failures.join('\n'));
  });

  it('rejects authorizing a second new event', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '### 6.16.2 The twelve rulings',
        '### 6.16.2 The twelve rulings\n\nAlso authorized: `asset.rasterization.requested`.\n',
      ),
    });
    assert.ok(mentions(failures, 'second new event'), failures.join('\n'));
  });

  it('rejects a second queue, scheduler or sweep proposed as architecture', () => {
    for (const architecture of ['second queue', 'polling sweep', 'cron reconciler']) {
      const failures = run({
        [CANONICAL_FILES.phase]: phase().replace(
          '### 6.16.3 Dependency reconciliation',
          `Normalization runs through a ${architecture} owned by the worker.\n\n### 6.16.3 Dependency reconciliation`,
        ),
      });
      assert.ok(
        mentions(failures, `"${architecture}" appears without a refusal`),
        `expected a failure for ${architecture}`,
      );
    }
  });

  it('rejects a fact table that stops naming the existing architecture', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '`EXISTING_OUTBOX_AND_WORKER`',
        '`DEDICATED_NORMALIZATION_QUEUE`',
      ),
    });
    assert.ok(mentions(failures, 'Normalization queue architecture'), failures.join('\n'));
  });
});

describe('APP3-G06 — the payload', () => {
  it('rejects a payload without the association reference', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('associationRef', 'contextHint'),
      [CANONICAL_FILES.register]: register().replaceAll('associationRef', 'contextHint'),
    });
    assert.ok(mentions(failures, 'associationRef'), failures.join('\n'));
  });

  it('rejects a payload that carries the profile', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'The payload never carries a profile, ownership claim, storage key, URL,',
        'The payload carries processingProfile plus a storage key, URL,',
      ),
    });
    assert.ok(mentions(failures, 'processingProfile'), failures.join('\n'));
  });

  it('rejects a missing or wrong policy version', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `Normalization policy version` | `1` |',
        '| `Normalization policy version` | `2` |',
      ),
    });
    assert.ok(mentions(failures, 'Normalization policy version'), failures.join('\n'));
  });

  it('rejects dropping an association reference field', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('designSessionAssetId', 'sessionRef'),
    });
    assert.ok(mentions(failures, 'designSessionAssetId'), failures.join('\n'));
  });
});

describe('APP3-G06 — producer and profile derivation', () => {
  it('rejects a changed association-to-profile mapping', () => {
    const failures = run({
      // The two documents spell the arrow differently — one backtick pair in the
      // phase plan, two in the register — so the mutation is a pattern.
      [CANONICAL_FILES.phase]: phase().replace(
        /DESIGN_TEMPLATE_ASSET(`?) → (`?)TEMPLATE_ASSET/,
        'DESIGN_TEMPLATE_ASSET$1 → $2SESSION_UPLOAD',
      ),
      [CANONICAL_FILES.register]: register().replace(
        /DESIGN_TEMPLATE_ASSET(`?) → (`?)TEMPLATE_ASSET/,
        'DESIGN_TEMPLATE_ASSET$1 → $2SESSION_UPLOAD',
      ),
    });
    assert.ok(mentions(failures, 'DESIGN_TEMPLATE_ASSET'), failures.join('\n'));
  });

  it('rejects a producer that is not transactional', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `Producer transaction` | `SAME_TRANSACTION_AS_ASSOCIATION_WRITE` |',
        '| `Producer transaction` | `AFTER_COMMIT_BEST_EFFORT` |',
      ),
    });
    assert.ok(mentions(failures, 'Producer transaction'), failures.join('\n'));
  });

  it('rejects losing the no-event rules for reads, no-ops and uploads', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('on a read', 'on every read'),
      [CANONICAL_FILES.register]: register().replaceAll('on a read', 'on every read'),
    });
    assert.ok(mentions(failures, 'no event'), failures.join('\n'));
  });

  it('rejects a worker that scans associations and picks one', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('never scans', 'freely scans'),
      [CANONICAL_FILES.register]: register().replaceAll('never scans', 'freely scans'),
    });
    assert.ok(failures.length > 0, 'expected the association-scan refusal to be required');
  });

  it('rejects the discriminator being treated as authorization', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('lookup key', 'authorization token'),
      [CANONICAL_FILES.register]: register().replaceAll('lookup key', 'authorization token'),
    });
    assert.ok(mentions(failures, 'lookup key'), failures.join('\n'));
  });
});

describe('APP3-G06 — the replan and staging', () => {
  it('rejects an unsplit W01', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('APP3-W01A', 'APP3-W01'),
    });
    assert.ok(failures.length > 0, 'expected the W01A/W01B split to be required');
  });

  it('rejects marking the failed W01 complete', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'APP3-W01 = REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B',
        'APP3-W01 = COMPLETE — REVIEW_DELIVERED',
      ),
    });
    assert.ok(mentions(failures, 'recorded complete'), failures.join('\n'));
  });

  it('rejects a W01A that accepts SVG', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `W01A source scope` | `RASTER_ONLY` |',
        '| `W01A source scope` | `RASTER_AND_SVG` |',
      ),
    });
    assert.ok(mentions(failures, 'W01A source scope'), failures.join('\n'));
  });

  it('rejects SVG being silently dropped from scope', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `Template SVG availability` | `AUTHORIZED_BUT_UNAVAILABLE_UNTIL_W01B` |',
        '| `Template SVG availability` | `REMOVED_FROM_SCOPE` |',
      ),
    });
    assert.ok(mentions(failures, 'Template SVG availability'), failures.join('\n'));
  });

  it('rejects a sanitizer selected before APP3-G07', () => {
    // Two consistent worlds: until G07 is delivered and `IMP-D047` is LOCKED,
    // G06's own authority must name no sanitizer package; afterwards the choice
    // is G07's to state and G06's remains the section that deferred it.
    for (const packageName of ['dompurify', 'svgo']) {
      const failures = run({
        [CANONICAL_FILES.phase]: phase()
          .replace(/APP3-G07 = COMPLETE[^\n]*/, 'APP3-G07 = READY — NOT STARTED')
          .replace(
            '### 6.16.3 Dependency reconciliation',
            `W01B will use \`${packageName}\` as the sanitizer.\n\n### 6.16.3 Dependency reconciliation`,
          ),
      });
      assert.ok(
        mentions(failures, `sanitizer "${packageName}" was selected`),
        `expected a failure for ${packageName}`,
      );
    }
  });

  it('rejects moving sanitizer ownership away from G07', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `SVG sanitizer owner` | `APP3-G07` |',
        '| `SVG sanitizer owner` | `APP3-W01A` |',
      ),
    });
    assert.ok(mentions(failures, 'SVG sanitizer owner'), failures.join('\n'));
  });
});

describe('APP3-G06 — ownership and blockers', () => {
  it('rejects B01N gaining an HTTP operation', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `B01N HTTP operations` | `0` |',
        '| `B01N HTTP operations` | `1` |',
      ),
    });
    assert.ok(mentions(failures, 'B01N HTTP operations'), failures.join('\n'));
  });

  it('rejects B06 remaining the Product Side trigger owner', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `SIDE_BACKGROUND trigger owner` | `APP3-B01N` |',
        '| `SIDE_BACKGROUND trigger owner` | `APP3-B06` |',
      ),
    });
    assert.ok(mentions(failures, 'SIDE_BACKGROUND trigger owner'), failures.join('\n'));
  });

  it('rejects B02 still being blocked by B06', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        /APP3-B02 = READY_BY[^\n]+/,
        'APP3-B02 = BLOCKED_BY_APP3-B06',
      ),
    });
    assert.ok(mentions(failures, 'B06'), failures.join('\n'));
  });

  it('rejects closing the platform Zod/OpenAPI follow-up here', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-G06',
      ),
    });
    assert.ok(mentions(failures, 'follow-up'), failures.join('\n'));
  });

  it('rejects handing the public-media-dimensions follow-up back to B06', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        /FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 STATE = [^\n]+/,
        'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 BLOCKED_BY = APP3-B06',
      ),
    });
    assert.ok(mentions(failures, 'names APP3-B06 again'), failures.join('\n'));
  });

  it('rejects a follow-up left unadvanced once the producer exists', () => {
    // Two consistent worlds: before B01N the follow-up names it as a blocker,
    // after B01N it records that its foundation is ready. A blocker that
    // survives the producer is the mixture that fails.
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        /FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 STATE = [^\n]+/,
        'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 BLOCKED_BY = APP3-B01N',
      ),
    });
    assert.ok(mentions(failures, 'was not advanced'), failures.join('\n'));
  });

  it('rejects dropping the blocker before the producer exists', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase()
        .replaceAll('APP3-B01N = COMPLETE', 'APP3-B01N = READY — NOT STARTED')
        .replace(/FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 STATE = [^\n]+\n/, ''),
    });
    assert.ok(mentions(failures, 'was not corrected'), failures.join('\n'));
  });
});

describe('APP3-G06 — the authority stays authority', () => {
  it('rejects a worker implementation while APP3-W01A is not recorded complete', () => {
    // Two consistent worlds: before W01A the worker must not mention the event,
    // after it the worker owns it. Every mixture fails.
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll(
        'APP3-W01A = COMPLETE',
        'APP3-W01A = READY — NOT STARTED',
      ),
    });
    assert.ok(mentions(failures, 'before APP3-W01A is recorded complete'), failures.join('\n'));
  });

  it('rejects an API producer appended before the gate is accepted', () => {
    const failures = run({
      'apps/api/src/modules/catalog/application/normalization.producer.ts':
        "export const EVENT = 'asset.normalization.requested';\n",
    });
    assert.ok(mentions(failures, 'implements the normalization event'), failures.join('\n'));
  });

  it('rejects the stale-association outcome leaking into the API in either world', () => {
    // The outcome is the consumer's. Delivering W01A does not license the API to
    // reproduce it — that surface belongs to APP3-B01N, which has not run.
    const failures = run({
      'apps/api/src/modules/catalog/application/normalization-context.ts':
        "export const CODE = 'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE';\n",
    });
    assert.ok(mentions(failures, "the producer is APP3-B01N's"), failures.join('\n'));
  });

  it('rejects a persisted profile column', () => {
    const failures = run({
      [CANONICAL_FILES.derivativeSchema]: `${read(CANONICAL_FILES.derivativeSchema)}\nconst _column = 'processing_profile';\n`,
    });
    assert.ok(mentions(failures, 'processing_profile'), failures.join('\n'));
  });

  it('rejects a new editor derivative kind', () => {
    const failures = run({
      [CANONICAL_FILES.derivativeSchema]: read(CANONICAL_FILES.derivativeSchema).replace(
        "'NORMALIZED',",
        "'NORMALIZED',\n  'EDITOR_SAFE',",
      ),
    });
    assert.ok(mentions(failures, 'EDITOR_SAFE'), failures.join('\n'));
  });

  it('rejects a CHECK closing the outbox event-type set', () => {
    // PO-01 claims a new event costs no migration. That is only true while
    // `event_type` stays open text.
    const failures = run({
      [CANONICAL_FILES.outboxSchema]: read(CANONICAL_FILES.outboxSchema).replace(
        "check('ck_outbox_events__status_allowed'",
        "check('ck_outbox_events__event_type_allowed', sql`event_type in ('a')`),\n    check('ck_outbox_events__status_allowed'",
      ),
    });
    assert.ok(mentions(failures, 'event_type gained a CHECK'), failures.join('\n'));
  });

  it('rejects losing an association primary key the payload depends on', () => {
    const failures = run({
      [CANONICAL_FILES.templateAssets]: read(CANONICAL_FILES.templateAssets).replace(
        'pk_design_template_assets',
        'pk_template_asset_legacy',
      ),
    });
    assert.ok(mentions(failures, 'associationRef is unrepresentable'), failures.join('\n'));
  });
});

describe('APP3-G06 — governance', () => {
  it('rejects a new root package.json script', () => {
    const manifest = JSON.parse(read(CANONICAL_FILES.rootManifest));
    manifest.scripts['check:app3-g06'] = 'node tools/check-app3-g06.mjs';
    const failures = run({
      [CANONICAL_FILES.rootManifest]: JSON.stringify(manifest, null, 2),
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  it('rejects an unindexed checkpoint command', () => {
    const failures = run({
      [CANONICAL_FILES.commandIndex]: read(CANONICAL_FILES.commandIndex).replaceAll(
        'CMD-CHECK-APP3-G06',
        'CMD-X',
      ),
    });
    assert.ok(mentions(failures, 'does not index CMD-CHECK-APP3-G06'), failures.join('\n'));
  });

  it('rejects an unreconciled security or NFR document', () => {
    const failures = run({
      [CANONICAL_FILES.security]: read(CANONICAL_FILES.security).replaceAll('APP3-G07', 'later'),
    });
    assert.ok(mentions(failures, 'sanitizer owner'), failures.join('\n'));
  });

  it('rejects an unreconciled pre-implementation audit', () => {
    const failures = run({
      [CANONICAL_FILES.audit]: read(CANONICAL_FILES.audit).replaceAll('IMP-D046', 'a later ruling'),
    });
    assert.ok(mentions(failures, 'pre-implementation audit'), failures.join('\n'));
  });

  it('reports an APP3-B01 regression from the gates it chains', () => {
    const failures = run({
      [B01_FILES.policy]: read(B01_FILES.policy).replace(
        "EDITOR_SAFE_DERIVATIVE_KIND = 'NORMALIZED'",
        "EDITOR_SAFE_DERIVATIVE_KIND = 'CATALOG_PREVIEW'",
      ),
    });
    assert.ok(mentions(failures, 'APP3-B01 regression'), failures.join('\n'));
  });
});

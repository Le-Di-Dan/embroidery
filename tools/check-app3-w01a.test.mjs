/**
 * Regressions for the `APP3-W01A` gate.
 *
 * Each case breaks exactly one ruled property of the raster normalization
 * consumer in a throwaway copy of the repository and proves the checker refuses
 * it. The cases worth reading twice are the ones a later edit would make for
 * convenience and that still compile: a profile taken from the payload, an
 * association scan, the quartet copied from the source Asset, `READY` written
 * before the four fields, an existing derivative answering a request whose
 * context was never revalidated. None of those fail loudly at runtime, which is
 * why the gate has to assert them.
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
import { CANONICAL_FILES as G06_FILES, DECISION_ID } from './check-app3-g06.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, REPO_ROOT, checkApp3W01A } from './check-app3-w01a.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-W01A` chains `APP3-G06`, which chains B01 → P02 → G05 → P01 → F01/DB01 →
 * G04 → G03 → G02 → G01, so the root needs every canonical file those gates read
 * plus real `.git` history for G01's chronology half. Both application source
 * trees are copied because the consumer walk and G06's no-implementation walk
 * read them: without them several checks would pass vacuously.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-w01a-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(G06_FILES),
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
    return checkApp3W01A(dir);
  } finally {
    for (const relative of touched) {
      try {
        cpSync(join(REPO_ROOT, relative), join(dir, relative));
      } catch {
        // The case created a file the repository does not have; remove it.
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const file = (key) => read(CANONICAL_FILES[key]);
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP3-W01A — the delivered consumer passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3W01A(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-W01A — the event contract', () => {
  it('rejects renaming the ruled event type', () => {
    // The literal lives in the shared package since APP3-B01N; the consumer
    // aliases it. Renaming it there is how both applications would move
    // together and away from what the accepted contract says.
    const failures = run({
      [CANONICAL_FILES.sharedContract]: file('sharedContract').replace(
        "'asset.normalization.requested'",
        "'asset.normalize.requested'",
      ),
    });
    assert.ok(mentions(failures, 'the ruled event type'), failures.join('\n'));
  });

  it('rejects a consumer that re-declares the vocabulary instead of importing it', () => {
    const failures = run({
      [CANONICAL_FILES.payload]: file('payload').replace(
        'ASSET_NORMALIZATION_EVENT_TYPE = ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE',
        "ASSET_NORMALIZATION_EVENT_TYPE = 'asset.normalization.requested'",
      ),
    });
    assert.ok(mentions(failures, 'the event-type alias'), failures.join('\n'));
  });

  it('rejects a profile carried on the payload', () => {
    // The whole point of IMP-D046: the producer states the association, the
    // consumer derives the profile. A payload profile makes the derivation a
    // suggestion.
    const failures = run({
      [CANONICAL_FILES.sharedContract]: file('sharedContract').replace(
        'readonly assetId: string;',
        'readonly assetId: string;\n  readonly profile: string;',
      ),
    });
    assert.ok(mentions(failures, 'forbidden field "profile"'), failures.join('\n'));
  });

  it('rejects tolerant payload validation', () => {
    const failures = run({
      [CANONICAL_FILES.payload]: file('payload').replaceAll('exactKeys', 'looseKeys'),
    });
    assert.ok(mentions(failures, 'exact key validation'), failures.join('\n'));
  });

  it('rejects repurposing the accepted APP2 inspection event', () => {
    const failures = run({
      [CANONICAL_FILES.inspectionPayload]: `${file('inspectionPayload')}\nexport const NORMALIZATION = true;\n`,
    });
    assert.ok(mentions(failures, 'repurposed for normalization'), failures.join('\n'));
  });
});

describe('APP3-W01A — the same worker architecture', () => {
  it('rejects a second job family', () => {
    const failures = run({
      [CANONICAL_FILES.handler]: file('handler').replace(
        'jobKind = ASSET_PROCESSING',
        "jobKind = 'ASSET_NORMALIZATION'",
      ),
    });
    assert.ok(mentions(failures, 'ASSET_PROCESSING job kind'), failures.join('\n'));
  });

  it('rejects a poller added inside the job', () => {
    const failures = run({
      [`${dirname(CANONICAL_FILES.usecase)}/sweep.ts`]:
        'export const start = () => setInterval(() => undefined, 1000);\n',
    });
    assert.ok(mentions(failures, 'W01A adds no scheduler'), failures.join('\n'));
  });

  it('rejects leaving the capability out of the worker composition', () => {
    const failures = run({
      [CANONICAL_FILES.workerModule]: file('workerModule').replaceAll(
        'AssetNormalizationModule',
        'AssetInspectionModule',
      ),
    });
    assert.ok(mentions(failures, 'not composed into the worker'), failures.join('\n'));
  });
});

describe('APP3-W01A — profile derivation stays association-bound', () => {
  it('rejects dropping the active-association check', () => {
    const failures = run({
      [CANONICAL_FILES.association]: file('association').replace('!association.active', 'false'),
    });
    assert.ok(mentions(failures, 'the active-association check'), failures.join('\n'));
  });

  it('rejects dropping the association-points-at-this-Asset check', () => {
    const failures = run({
      [CANONICAL_FILES.association]: file('association').replace(
        'association.assetId !== assetId',
        'false',
      ),
    });
    assert.ok(mentions(failures, 'points-at-this-Asset'), failures.join('\n'));
  });

  it('rejects a port that can enumerate an Asset’s associations', () => {
    // A scan is how "derive the profile" silently becomes "find one that fits".
    // Refusing it at the port means it cannot be written without a contract
    // change a reviewer sees.
    const failures = run({
      [CANONICAL_FILES.port]: `${file('port')}\nexport type Scan = { findAssociationsFor: (id: string) => Promise<unknown[]> };\n`,
    });
    assert.ok(mentions(failures, 'association scan by Asset'), failures.join('\n'));
  });

  it('rejects losing the per-profile asset lane check', () => {
    const failures = run({
      [CANONICAL_FILES.association]: file('association').replaceAll(
        'LANE_BY_PROFILE',
        'LANES_TODO',
      ),
    });
    assert.ok(mentions(failures, 'the per-profile asset lane check'), failures.join('\n'));
  });
});

describe('APP3-W01A — raster-only sources and the exact limits', () => {
  it('rejects widening the decoded-pixel budget', () => {
    const failures = run({
      [CANONICAL_FILES.policy]: file('policy').replace(
        'maxDecodedPixels: 16_777_216',
        'maxDecodedPixels: 67_108_864',
      ),
    });
    assert.ok(mentions(failures, 'the decoded-pixel budget'), failures.join('\n'));
  });

  it('rejects admitting SVG beyond its single staged constant', () => {
    const failures = run({
      [CANONICAL_FILES.policy]: file('policy').replace(
        "'image/jpeg',",
        "'image/svg+xml',\n  'image/jpeg',",
      ),
    });
    assert.ok(mentions(failures, 'SVG appears in the policy'), failures.join('\n'));
  });

  it('rejects a sanitizer chosen before APP3-G07', () => {
    const manifest = JSON.parse(read(CANONICAL_FILES.workerManifest));
    manifest.dependencies = { ...manifest.dependencies, dompurify: '^3.0.0' };
    const failures = run({
      [CANONICAL_FILES.workerManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'sanitizer dependency "dompurify"'), failures.join('\n'));
  });

  it('rejects silently dropping the Template SVG staged outcome', () => {
    const failures = run({
      [CANONICAL_FILES.derivative]: file('derivative').replaceAll(
        'TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE',
        'SOURCE_MEDIA_TYPE_NOT_SUPPORTED',
      ),
    });
    assert.ok(mentions(failures, 'staged-capability outcome'), failures.join('\n'));
  });
});

describe('APP3-W01A — the quartet is measured, not copied', () => {
  it('rejects substituting the source Asset’s dimensions', () => {
    const failures = run({
      [CANONICAL_FILES.derivative]: file('derivative').replace(
        'widthPx: produced.width',
        'widthPx: source.widthPx',
      ),
    });
    assert.ok(mentions(failures, 'substitutes source Asset metadata'), failures.join('\n'));
  });

  it('rejects a byte size that is not the counted stream’s', () => {
    const failures = run({
      [CANONICAL_FILES.derivative]: file('derivative').replace(
        'BigInt(counter.byteSize)',
        'BigInt(0)',
      ),
    });
    assert.ok(mentions(failures, 'the counted byte size'), failures.join('\n'));
  });

  it('rejects a checksum that is not the counted stream’s', () => {
    const failures = run({
      [CANONICAL_FILES.derivative]: file('derivative').replaceAll('counter.digest()', "''"),
    });
    assert.ok(mentions(failures, 'the counted checksum'), failures.join('\n'));
  });
});

describe('APP3-W01A — completion is atomic and claim-guarded', () => {
  it('rejects finalizing without this attempt’s claim', () => {
    const failures = run({
      [CANONICAL_FILES.repository]: file('repository').replaceAll("and status = 'PROCESSING'", ''),
    });
    assert.ok(mentions(failures, 'guarded on this attempt'), failures.join('\n'));
  });

  it('rejects the normalization repository writing assets.status', () => {
    // `assets.status` is APP2 inspection's. A consumer that flips it can make an
    // Asset look inspected because a derivative happened to succeed.
    const failures = run({
      [CANONICAL_FILES.repository]: `${file('repository')}\nconst _sql = "update assets set status = 'READY'";\n`,
    });
    assert.ok(mentions(failures, 'writes assets.status'), failures.join('\n'));
  });

  it('rejects reaching into the APP2 derivative kinds', () => {
    const failures = run({
      [CANONICAL_FILES.repository]: `${file('repository')}\nconst _kind = 'CATALOG_PREVIEW';\n`,
    });
    assert.ok(mentions(failures, 'the APP2 kind CATALOG_PREVIEW'), failures.join('\n'));
  });
});

describe('APP3-W01A — idempotency and the untouched schema', () => {
  it('rejects an effect key that includes the association', () => {
    const failures = run({
      [CANONICAL_FILES.payload]: file('payload').replace(
        '${EFFECT_KEY_PREFIX}${payload.assetId}:${String(payload.normalizationPolicyVersion)}',
        '${EFFECT_KEY_PREFIX}${associationIdOf(payload)}',
      ),
    });
    assert.ok(
      mentions(failures, 'the effect key is not Asset + policy version'),
      failures.join('\n'),
    );
  });

  it('rejects answering from an existing result before revalidating its context', () => {
    // Ordering is the whole guarantee: a `READY` derivative is not an answer to a
    // request whose association was archived in the meantime.
    const failures = run({
      [CANONICAL_FILES.usecase]: `const _early = 'REPLAY_READY';\n${file('usecase')}`,
    });
    assert.ok(mentions(failures, 'before its context is validated'), failures.join('\n'));
  });

  it('rejects losing the partial unique index that makes one derivative authoritative', () => {
    const failures = run({
      [CANONICAL_FILES.derivativeSchema]: file('derivativeSchema').replaceAll(
        'uq_asset_derivatives__asset_kind__not_failed',
        'ix_asset_derivatives__asset_kind',
      ),
    });
    assert.ok(mentions(failures, 'partial unique index'), failures.join('\n'));
  });

  it('rejects persisting the profile on the derivative', () => {
    const failures = run({
      [CANONICAL_FILES.derivativeSchema]: `${file('derivativeSchema')}\nconst _column = 'processing_profile';\n`,
    });
    assert.ok(mentions(failures, 'processing_profile'), failures.join('\n'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const failures = run({
      'packages/database/migrations/9999_w01a_regression.sql': 'select 1;\n',
    });
    assert.ok(mentions(failures, 'W01A adds none'), failures.join('\n'));
  });
});

describe('APP3-W01A — scope and governance', () => {
  it('rejects an HTTP operation appended by this checkpoint', () => {
    const document = JSON.parse(read(CANONICAL_FILES.openapi));
    document.paths['/v1/regression'] = { get: { operationId: 'regression_get', responses: {} } };
    const failures = run({ [CANONICAL_FILES.openapi]: JSON.stringify(document) });
    assert.ok(mentions(failures, 'W01A adds none'), failures.join('\n'));
  });

  it('rejects a normalization surface published over HTTP', () => {
    const document = JSON.parse(read(CANONICAL_FILES.openapi));
    document.components.schemas.normalizationBody = { type: 'object' };
    const failures = run({ [CANONICAL_FILES.openapi]: JSON.stringify(document) });
    assert.ok(mentions(failures, 'W01A adds no HTTP surface'), failures.join('\n'));
  });

  it('rejects a root script added for the new suites', () => {
    const manifest = JSON.parse(read(CANONICAL_FILES.rootManifest));
    manifest.scripts = { ...manifest.scripts, 'check:app3-w01a': 'node tools/check-app3-w01a.mjs' };
    const failures = run({
      [CANONICAL_FILES.rootManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  it('rejects unindexed checkpoint commands', () => {
    const failures = run({
      [CANONICAL_FILES.commandIndex]: read(CANONICAL_FILES.commandIndex)
        .split('\n')
        .filter((line) => !line.includes('CMD-CHECK-APP3-W01A'))
        .join('\n'),
    });
    assert.ok(mentions(failures, 'does not index CMD-CHECK-APP3-W01A'), failures.join('\n'));
  });

  it('rejects quietly closing the platform Zod/OpenAPI follow-up', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: read(CANONICAL_FILES.phase).replace(
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = CLOSED',
      ),
    });
    assert.ok(mentions(failures, 'no longer recorded as open'), failures.join('\n'));
  });

  it('reports an APP3-G06 regression through the chained gate', () => {
    const failures = run({
      [G06_FILES.register]: read(G06_FILES.register)
        .split('\n')
        .filter((line) => !line.startsWith(`| ${DECISION_ID} |`))
        .join('\n'),
    });
    assert.ok(mentions(failures, 'APP3-G06 regression:'), failures.join('\n'));
  });
});

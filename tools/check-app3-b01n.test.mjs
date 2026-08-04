/**
 * Regressions for the `APP3-B01N` gate.
 *
 * Each case breaks exactly one ruled property of the normalization request
 * producer in a throwaway copy of the repository and proves the checker refuses
 * it. The cases worth reading twice are the ones a later edit would make for
 * convenience and that still compile and still pass a happy-path test: the event
 * string restated in the API so the two applications can drift apart, the append
 * moved before the Side write or outside the transaction, a request scheduled on
 * a rename, the replaced Asset's derivative deleted "to save space".
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
import { CANONICAL_FILES as G06_FILES } from './check-app3-g06.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { CANONICAL_FILES as W01A_FILES } from './check-app3-w01a.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { OPENAPI_FILE } from './check-app3-b01n-artifacts.mjs';
import { CANONICAL_FILES, REPO_ROOT, checkApp3B01N } from './check-app3-b01n.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-B01N` chains `APP3-W01A`, which chains G06 → B01 → P02 → G05 → P01 →
 * F01/DB01 → G04 → G03 → G02 → G01, so the root needs every canonical file those
 * gates read plus real `.git` history for G01's chronology half. Both
 * application source trees, the shared contract and the generated client are
 * copied because the cross-import walk, the event-string scan and the tree hash
 * read them: without them several checks would pass vacuously.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b01n-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(W01A_FILES),
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
    'packages/domain-types/src',
    'packages/api-client/src/generated',
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
    return checkApp3B01N(dir);
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

describe('APP3-B01N — the delivered producer passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3B01N(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-B01N — one shared event contract', () => {
  it('rejects losing the shared builder', () => {
    const failures = run({
      [CANONICAL_FILES.contract]: file('contract').replaceAll(
        'buildAssetNormalizationRequestedPayload',
        'makePayload',
      ),
    });
    assert.ok(mentions(failures, 'the payload builder'), failures.join('\n'));
  });

  it('rejects a builder that lets its caller choose the policy version', () => {
    // A producer could then ask for rules this deployment does not implement,
    // and the consumer would answer JOB_SCHEMA_UNSUPPORTED for a request the
    // producer thought was valid.
    const failures = run({
      [CANONICAL_FILES.contract]: file('contract').replace(
        'normalizationPolicyVersion: ASSET_NORMALIZATION_POLICY_VERSION',
        'normalizationPolicyVersion: input.normalizationPolicyVersion',
      ),
    });
    assert.ok(mentions(failures, 'takes the policy version from its caller'), failures.join('\n'));
  });

  it('rejects a profile smuggled into the shared payload', () => {
    const failures = run({
      [CANONICAL_FILES.contract]: file('contract').replace(
        'readonly assetId: string;',
        'readonly assetId: string;\n  readonly profile: string;',
      ),
    });
    assert.ok(mentions(failures, 'forbidden field "profile"'), failures.join('\n'));
  });

  it('rejects an unexported contract', () => {
    const failures = run({
      [CANONICAL_FILES.contractIndex]: file('contractIndex').replace(
        'buildAssetNormalizationRequestedPayload,\n',
        '',
      ),
    });
    assert.ok(mentions(failures, 'does not export'), failures.join('\n'));
  });

  it('rejects a shared package the compiled applications could not require', () => {
    // The APP2-T01 defect exactly: a source-resolved package passes every test
    // and fails at load inside the container.
    const manifest = JSON.parse(file('contractManifest'));
    manifest.main = './src/index.ts';
    const failures = run({
      [CANONICAL_FILES.contractManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'could not require it'), failures.join('\n'));
  });

  it('rejects a shared contract that reaches for a runtime package', () => {
    const failures = run({
      [CANONICAL_FILES.contract]: `import { schema } from '@embroidery/database';\n${file('contract')}\nconst _ = schema;\n`,
    });
    assert.ok(mentions(failures, 'pure vocabulary'), failures.join('\n'));
  });
});

describe('APP3-B01N — the two applications stay apart', () => {
  it('rejects the API restating the event string', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replace(
        'ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,',
        "ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE = 'asset.normalization.requested',",
      ),
    });
    assert.ok(mentions(failures, 'restates the event type'), failures.join('\n'));
  });

  it('rejects the API importing the worker', () => {
    const failures = run({
      'apps/api/src/modules/catalog/application/product-placement-borrowed.ts':
        "export { parseAssetNormalizationPayload } from '../../../../../worker/src/jobs/asset-normalization/domain/asset-normalization.payload';\n",
    });
    assert.ok(mentions(failures, 'imports apps/worker'), failures.join('\n'));
  });

  it('rejects a consumer that stops importing the shared contract', () => {
    const failures = run({
      [CANONICAL_FILES.workerPolicy]: file('workerPolicy').replaceAll(
        'ASSET_NORMALIZATION_POLICY_VERSION',
        'LOCAL_POLICY_VERSION',
      ),
    });
    assert.ok(mentions(failures, 'restates the policy version'), failures.join('\n'));
  });

  it('rejects a producer that stops importing the shared contract', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replaceAll(
        '@embroidery/domain-types',
        './local',
      ),
    });
    assert.ok(mentions(failures, 'no longer imports the shared'), failures.join('\n'));
  });
});

describe('APP3-B01N — the producer rule', () => {
  it('rejects losing the changed-background test', () => {
    // Without it every save of an unchanged placement would schedule work.
    const failures = run({
      [CANONICAL_FILES.intents]: file('intents').replaceAll(
        'fields.backgroundAssetId',
        'fields.name',
      ),
    });
    assert.ok(mentions(failures, 'the changed-background test'), failures.join('\n'));
  });

  it('rejects scheduling work for a retired side', () => {
    const failures = run({
      [CANONICAL_FILES.intents]: `${file('intents')}\nconst _retired = (p) => p.sides.retired;\n`,
    });
    assert.ok(mentions(failures, 'a retirement schedules no work'), failures.join('\n'));
  });

  it('rejects the producer deleting the replaced Asset’s derivative', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: `${file('recorder')}\nexport const cleanUp = () => deleteDerivative();\n`,
    });
    assert.ok(mentions(failures, "the replaced Asset's derivative"), failures.join('\n'));
  });

  it('rejects a producer that names another association kind', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replace(
        "kind: 'PRODUCT_SIDE_BACKGROUND'",
        "kind: 'DESIGN_TEMPLATE_ASSET'",
      ),
    });
    assert.ok(mentions(failures, 'B01N owns Product Sides only'), failures.join('\n'));
  });

  it('rejects a profile asserted by the producer', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replace(
        'aggregateId: intent.assetId,',
        "aggregateId: intent.assetId,\n        profile: 'SIDE_BACKGROUND',",
      ),
    });
    assert.ok(mentions(failures, 'the consumer derives it'), failures.join('\n'));
  });
});

describe('APP3-B01N — the append is transactional and ordered', () => {
  it('rejects an append that precedes the Side write', () => {
    // It would name a generated id no row carries yet.
    const failures = run({
      [CANONICAL_FILES.service]: file('service')
        .replace(
          'await this.normalization.record(planSideNormalizationRequests(plan.sides));\n',
          '',
        )
        .replace(
          'await this.apply(plan);',
          'await this.normalization.record(planSideNormalizationRequests(plan.sides));\n      await this.apply(plan);',
        ),
    });
    assert.ok(mentions(failures, 'precedes the Side write'), failures.join('\n'));
  });

  it('rejects dropping the append entirely', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replace(
        'await this.normalization.record(planSideNormalizationRequests(plan.sides));',
        '',
      ),
    });
    assert.ok(mentions(failures, 'never appends'), failures.join('\n'));
  });

  it('rejects a recorder that opens its own transaction', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replace(
        'async record(',
        'async runInTransaction(): Promise<void> {}\n\n  async record(',
      ),
    });
    assert.ok(mentions(failures, 'opens its own transaction'), failures.join('\n'));
  });

  it('rejects a fire-and-forget append', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replace(
        'await this.outbox.append({',
        'void this.outbox.append({',
      ),
    });
    assert.ok(mentions(failures, 'never fire-and-forget'), failures.join('\n'));
  });

  it('rejects bypassing the transactional Outbox adapter', () => {
    const failures = run({
      [CANONICAL_FILES.recorder]: file('recorder').replaceAll(
        'this.outbox.append',
        'this.queue.publish',
      ),
    });
    assert.ok(mentions(failures, 'established transactional Outbox'), failures.join('\n'));
  });
});

describe('APP3-B01N — APP3-B01 is untouched', () => {
  it('rejects losing the concurrency conflict code', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replaceAll(
        'PLACEMENT_VERSION_CONFLICT',
        'PLACEMENT_STALE',
      ),
    });
    assert.ok(mentions(failures, 'the concurrency conflict code'), failures.join('\n'));
  });

  it('rejects losing the plan’s changed-background detection', () => {
    const failures = run({
      [CANONICAL_FILES.plan]: file('plan').replace(
        'command.backgroundAssetId !== current.backgroundAssetId',
        'false',
      ),
    });
    assert.ok(mentions(failures, 'no longer detects a changed background'), failures.join('\n'));
  });

  it('rejects unwiring the recorder from the module', () => {
    const failures = run({
      [CANONICAL_FILES.module]: file('module').replaceAll(
        'ProductPlacementNormalizationRecorder',
        'UnusedProvider',
      ),
    });
    assert.ok(mentions(failures, 'not composed into the placement module'), failures.join('\n'));
  });

  it('rejects dropping a placement controller', () => {
    const failures = run({
      [CANONICAL_FILES.module]: file('module').replaceAll(
        'PublicProductPlacementController',
        'AdminProductPlacementController',
      ),
    });
    assert.ok(mentions(failures, 'is no longer wired'), failures.join('\n'));
  });
});

describe('APP3-B01N — the frozen artifacts and governance', () => {
  it('rejects any change to the OpenAPI artifact', () => {
    const document = JSON.parse(read(OPENAPI_FILE));
    document.paths['/v1/regression'] = { get: { operationId: 'regression_get', responses: {} } };
    const failures = run({ [OPENAPI_FILE]: JSON.stringify(document) });
    assert.ok(mentions(failures, 'the OpenAPI artifact changed'), failures.join('\n'));
    assert.ok(mentions(failures, 'B01N adds none'), failures.join('\n'));
  });

  it('rejects any change to the generated client', () => {
    const failures = run({
      'packages/api-client/src/generated/regression.ts': 'export const regression = 1;\n',
    });
    assert.ok(mentions(failures, 'the generated client changed'), failures.join('\n'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const failures = run({
      'packages/database/migrations/9999_b01n_regression.sql': 'select 1;\n',
    });
    assert.ok(mentions(failures, 'migrations; B01N adds none'), failures.join('\n'));
  });

  it('rejects a root script added for the new suites', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts = { ...manifest.scripts, 'check:app3-b01n': 'node tools/check-app3-b01n.mjs' };
    const failures = run({
      [CANONICAL_FILES.rootManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  it('rejects unindexed checkpoint commands', () => {
    const failures = run({
      [CANONICAL_FILES.commandIndex]: file('commandIndex')
        .split('\n')
        .filter((line) => !line.includes('CMD-CHECK-APP3-B01N'))
        .join('\n'),
    });
    assert.ok(mentions(failures, 'does not index CMD-CHECK-APP3-B01N'), failures.join('\n'));
  });

  it('rejects hiding the runtime dependency in devDependencies', () => {
    const manifest = JSON.parse(file('apiManifest'));
    delete manifest.dependencies['@embroidery/domain-types'];
    manifest.devDependencies = {
      ...manifest.devDependencies,
      '@embroidery/domain-types': 'workspace:*',
    };
    const failures = run({
      [CANONICAL_FILES.apiManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'hides the runtime requirement'), failures.join('\n'));
  });

  it('rejects quietly closing the platform Zod/OpenAPI follow-up', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: file('phase').replace(
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = CLOSED',
      ),
    });
    assert.ok(mentions(failures, 'no longer recorded as open'), failures.join('\n'));
  });

  it('reports an APP3-W01A regression through the chained gate', () => {
    const failures = run({
      [W01A_FILES.policy]: read(W01A_FILES.policy).replace(
        'maxDecodedPixels: 16_777_216',
        'maxDecodedPixels: 67_108_864',
      ),
    });
    assert.ok(mentions(failures, 'APP3-W01A regression:'), failures.join('\n'));
  });
});

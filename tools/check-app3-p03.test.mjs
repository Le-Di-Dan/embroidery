/**
 * Regressions for the `APP3-P03` gate.
 *
 * The defect this checkpoint closed never failed anything: runtime validation
 * worked and every test passed while the published contract said each request
 * body was empty. So each case here breaks exactly one property in a throwaway
 * copy of the repository and proves the checker refuses it — and the cases
 * worth reading twice are the ones a later edit would make for convenience and
 * that still compile: `unrepresentable: 'throw'` softened to a fallback, a new
 * body simply never registered, one DTO hand-decorated "just this once", or the
 * platform follow-up closed while `APP3-B03` still calls it a blocker.
 *
 * The gate must also be provably *capable* of failing. A checker that passes on
 * a repository it never really reads is worse than none, so several cases
 * assert the specific complaint text rather than merely a non-empty result.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as B01_FILES } from './check-app3-b01.mjs';
import { CANONICAL_FILES as B01N_FILES } from './check-app3-b01n.mjs';
import { CANONICAL_FILES as B02_FILES } from './check-app3-b02-contract.mjs';
import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { CANONICAL_FILES as G06_FILES } from './check-app3-g06.mjs';
import { CANONICAL_FILES as G07_FILES } from './check-app3-g07.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { CANONICAL_FILES as W01A_FILES } from './check-app3-w01a.mjs';
import { CANONICAL_FILES as W01B_FILES } from './check-app3-w01b.mjs';
import { CANONICAL_FILES as W01B_BOUNDARY_FILES } from './check-app3-w01b-boundaries.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { checkApp3P03Contract, zodDtoConsumers } from './check-app3-p03-contract.mjs';
import { CANONICAL_FILES, REPO_ROOT, checkApp3P03 } from './check-app3-p03.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-P03` chains B02, B01 and B01N, and those chain the whole APP3 spine, so
 * the root needs every canonical file those gates read plus real `.git` history
 * for G01's chronology half.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-p03-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(B02_FILES),
    ...Object.values(W01B_FILES),
    ...Object.values(W01B_BOUNDARY_FILES),
    ...Object.values(W01A_FILES),
    ...Object.values(G07_FILES),
    ...Object.values(G06_FILES),
    ...Object.values(B01_FILES),
    ...Object.values(B01N_FILES),
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
    'tools/check-app3-p03.mjs',
    'tools/check-app3-p03-contract.mjs',
    'tools/check-app3-p03.test.mjs',
  ]);
  for (const relative of canonical) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  for (const directory of [
    'apps/api/src',
    'apps/api/test',
    'apps/worker/src',
    'apps/worker/test',
    'packages/contracts/src',
    'packages/api-client/src/generated',
    'packages/design-engine/src',
    'packages/domain-types/src',
    DOCUMENT_SRC,
    'packages/database/migrations',
    '.git',
  ]) {
    cpSync(join(REPO_ROOT, directory), join(base, directory), { recursive: true });
  }
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}, checker = checkApp3P03) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checker(dir);
  } finally {
    for (const relative of touched) {
      try {
        cpSync(join(REPO_ROOT, relative), join(dir, relative));
      } catch {
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const file = (key) => read(CANONICAL_FILES[key]);
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** The published document with one mutation applied. */
function openapiWith(mutate) {
  const document = JSON.parse(file('openapi'));
  mutate(document);
  return JSON.stringify(document, undefined, 2);
}

describe('APP3-P03 — the delivered foundation passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3P03(REPO_ROOT), []);
  });

  it('accepts the published half on its own', () => {
    assert.deepEqual(checkApp3P03Contract(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });

  it('finds every schema-backed DTO the repository declares', () => {
    const names = zodDtoConsumers(REPO_ROOT).map((consumer) => consumer.name);
    assert.ok(names.length >= 16, `only ${String(names.length)} consumers found`);
    for (const expected of [
      'CreateProductBody',
      'UpdateProductBody',
      'ArchiveProductBody',
      'PublishProductBody',
      'UnpublishProductBody',
      'ReplaceProductPlacementBody',
      'StaffLoginRequestDto',
    ]) {
      assert.ok(names.includes(expected), `${expected} was not inventoried`);
    }
  });
});

describe('APP3-P03 — the conversion authority cannot be softened', () => {
  for (const [needle, complaint] of [
    ["unrepresentable: 'throw'", 'the refusal to publish an unrepresentable node'],
    ["cycles: 'throw'", 'the refusal to publish a cyclic schema'],
    ["io: 'input'", 'the input form'],
    ["target: 'openapi-3.0'", 'the OpenAPI 3.0 target'],
  ]) {
    // `replaceAll`, not `replace`: the file's own header documents each option,
    // and replacing only the first occurrence would edit the prose and leave the
    // configuration standing — a test that passes for the wrong reason.
    it(`refuses the loss of ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.converter]: file('converter').replaceAll(needle, "removed: 'x'"),
      });
      assert.ok(mentions(failures, complaint), failures.join('\n'));
    });
  }

  it('refuses a conversion that stops using Zod as the authority', () => {
    const failures = run({
      [CANONICAL_FILES.converter]: file('converter').replace(
        'z.toJSONSchema(',
        'handRolledConvert(',
      ),
    });
    assert.ok(mentions(failures, "no longer uses Zod's own exporter"), failures.join('\n'));
  });

  it('refuses a failure that stops throwing', () => {
    const failures = run({
      [CANONICAL_FILES.converter]: file('converter').replaceAll(
        'throw new ZodOpenApiSchemaError',
        'reportQuietly',
      ),
    });
    assert.ok(mentions(failures, 'no longer throws'), failures.join('\n'));
  });

  it('refuses a catch that falls back to an empty object', () => {
    const source = file('converter').replace(
      /\} catch \(cause\) \{/,
      "} catch (cause) {\n    return { type: 'object', properties: {} };\n    // eslint-disable-next-line",
    );
    const failures = run({ [CANONICAL_FILES.converter]: source });
    assert.ok(mentions(failures, 'falls back to an empty schema'), failures.join('\n'));
  });
});

describe('APP3-P03 — the augmentation keeps its teeth', () => {
  it('refuses an augmentation that no longer stops generation', () => {
    const failures = run({
      [CANONICAL_FILES.augmentation]: file('augmentation').replaceAll(
        'throw new ZodOpenApiSchemaError',
        'console.warn',
      ),
    });
    assert.ok(mentions(failures, 'no longer stops generation'), failures.join('\n'));
  });

  it('refuses the removal of the intentionally-empty allowlist', () => {
    const failures = run({
      [CANONICAL_FILES.augmentation]: file('augmentation').replaceAll(
        'INTENTIONALLY_EMPTY_REQUEST_BODIES',
        'SKIPPED_BODIES',
      ),
    });
    assert.ok(mentions(failures, 'allowlist is gone'), failures.join('\n'));
  });

  it('refuses a body quietly added to that allowlist', () => {
    const failures = run({
      [CANONICAL_FILES.augmentation]: file('augmentation').replace(
        'new Set<string>()',
        "new Set<string>(['CreateProductBody'])",
      ),
    });
    assert.ok(mentions(failures, 'allowlisted as intentionally empty'), failures.join('\n'));
  });

  it('refuses an augmentation that is never applied', () => {
    const failures = run({
      [CANONICAL_FILES.builder]: file('builder').replace('applyZodDtoSchemas(prefixed);', ''),
    });
    assert.ok(mentions(failures, 'is not applied'), failures.join('\n'));
  });

  it('refuses the augmentation being moved after the envelope transform', () => {
    const source = file('builder')
      .replace('  applyZodDtoSchemas(prefixed);\n', '')
      .replace(
        '  applyRequestIdHeaderContract(prefixed);',
        '  applyZodDtoSchemas(prefixed);\n  applyRequestIdHeaderContract(prefixed);',
      );
    const failures = run({ [CANONICAL_FILES.builder]: source });
    assert.ok(mentions(failures, 'no longer runs first'), failures.join('\n'));
  });
});

describe('APP3-P03 — runtime validation is not allowed to move', () => {
  it('refuses publication leaking into the validation pipe', () => {
    const source = file('pipe').replace(
      'import { zodSchemaOf }',
      'import { zodDtoRegistrations } from "./zod-dto-registry";\nimport { zodSchemaOf }',
    );
    const failures = run({ [CANONICAL_FILES.pipe]: source });
    assert.ok(mentions(failures, 'publication has leaked'), failures.join('\n'));
  });

  it('refuses a pipe that stops reading the schema off the metatype', () => {
    const failures = run({
      [CANONICAL_FILES.pipe]: file('pipe').replace(
        'zodSchemaOf(metadata.metatype)',
        'inferSchemaByName(metadata)',
      ),
    });
    assert.ok(mentions(failures, 'off the metatype'), failures.join('\n'));
  });

  it('refuses a validation contract change', () => {
    const failures = run({
      [CANONICAL_FILES.pipe]: file('pipe').replaceAll('BadRequestException', 'HttpException'),
    });
    assert.ok(mentions(failures, 'validation contract changed'), failures.join('\n'));
  });

  it('refuses the DTO factory taking on publication', () => {
    const failures = run({
      [CANONICAL_FILES.dto]: `${file('dto')}\nexport const publish = () => ApiProperty({});\n`,
    });
    assert.ok(mentions(failures, 'publication responsibility'), failures.join('\n'));
  });

  it('refuses a registry that stops reading the schema off the class', () => {
    const failures = run({
      [CANONICAL_FILES.registry]: file('registry').replaceAll('zodSchemaOf(', 'assumeSchema('),
    });
    assert.ok(mentions(failures, 'off the class'), failures.join('\n'));
  });
});

describe('APP3-P03 — no consumer may be skipped and none hand-decorated', () => {
  const placement =
    'apps/api/src/modules/catalog/presentation/schemas/admin-product-placement.request.ts';
  const product = 'apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts';

  it('refuses a body DTO that is never registered', () => {
    const source = read(product).replace(
      /registerZodDtos\([\s\S]*?\);/,
      'registerZodDtos(ProductIdParam, ListProductsQuery, UpdateProductBody, ArchiveProductBody);',
    );
    const failures = run({ [product]: source });
    assert.ok(
      mentions(failures, 'CreateProductBody is never registered for publication'),
      failures.join('\n'),
    );
  });

  it('refuses a new consumer added without registration', () => {
    const source = `${read(product)}\nexport class NewThingBody extends createZodDto(createProductBodySchema) {}\n`;
    const failures = run({ [product]: source });
    assert.ok(mentions(failures, 'NewThingBody is never registered'), failures.join('\n'));
  });

  it('refuses one DTO hand-decorating its way around the platform', () => {
    const source = read(placement).replace(
      'export class ReplaceProductPlacementBody extends createZodDto(replaceProductPlacementSchema) {}',
      'export class ReplaceProductPlacementBody extends createZodDto(replaceProductPlacementSchema) { @ApiProperty({}) declare expectedUpdatedAt: string; }',
    );
    const failures = run({ [placement]: source });
    assert.ok(mentions(failures, 'hand-decorates its own OpenAPI metadata'), failures.join('\n'));
  });
});

describe('APP3-P03 — no published body may go empty again', () => {
  it('refuses a request body republished as an empty object', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.CreateProductBody = { type: 'object', properties: {} };
      }),
    });
    assert.ok(mentions(failures, 'empty request-body schema'), failures.join('\n'));
  });

  it('refuses a nested component going empty while its parent looks fine', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.ReplacePlacementAreaBody = { type: 'object', properties: {} };
      }),
    });
    assert.ok(mentions(failures, 'empty request-body schema'), failures.join('\n'));
  });

  it('refuses the placement body losing its required list', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        delete document.components.schemas.ReplaceProductPlacementBody.required;
      }),
    });
    assert.ok(mentions(failures, 'not the token and sides'), failures.join('\n'));
  });

  it('refuses the concurrency token losing its offset-bearing format', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.ReplaceProductPlacementBody.properties.expectedUpdatedAt = {
          type: 'string',
        };
      }),
    });
    assert.ok(mentions(failures, 'offset-bearing date-time'), failures.join('\n'));
  });

  it('refuses the nested Side body being thinned out', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.ReplacePlacementSideBody.properties = {
          code: { type: 'string' },
        };
      }),
    });
    assert.ok(mentions(failures, 'nested Side body'), failures.join('\n'));
  });

  it('refuses the authored field descriptions being lost', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        delete document.components.schemas.ReplacePlacementSideBody.properties.backgroundAssetId
          .description;
      }),
    });
    assert.ok(mentions(failures, 'authored field descriptions'), failures.join('\n'));
  });

  it('refuses a generated client that types a body as an open bag', () => {
    const source = file('clientSchemas').replace(
      /export interface CreateProductBody \{/,
      'export interface CreateProductBody {\n  [key: string]: unknown;',
    );
    const failures = run({ [CANONICAL_FILES.clientSchemas]: source });
    assert.ok(mentions(failures, 'open bag'), failures.join('\n'));
  });

  it('refuses a generated client that drops a body type entirely', () => {
    const source = file('clientSchemas').replace(
      'export interface ReplacePlacementAreaBody {',
      'export interface RenamedAreaBody {',
    );
    const failures = run({ [CANONICAL_FILES.clientSchemas]: source });
    assert.ok(
      mentions(failures, 'no longer declares ReplacePlacementAreaBody'),
      failures.join('\n'),
    );
  });
});

describe('APP3-P03 — the published surface does not grow', () => {
  it('refuses a new path', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths['/api/admin/anything'] = {
          post: { operationId: 'anything_create', responses: {} },
        };
      }),
    });
    assert.ok(mentions(failures, 'paths; APP3-P03 adds none'), failures.join('\n'));
  });

  it('refuses a new operation on an existing path', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths['/api/admin/products'].delete = {
          operationId: 'adminProduct_delete',
          responses: {},
        };
      }),
    });
    assert.ok(mentions(failures, 'operations; APP3-P03 adds none'), failures.join('\n'));
  });

  it('refuses a request body added to the APP3-B02 binary route', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths['/api/public/products/{slug}/sides/{sideCode}/background'].get.requestBody =
          {
            content: { 'application/json': { schema: { type: 'object', properties: {} } } },
          };
      }),
    });
    assert.ok(mentions(failures, 'binary operation'), failures.join('\n'));
  });

  it('refuses the APP3-B02 operation being renamed', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths['/api/public/products/{slug}/sides/{sideCode}/background'].get.operationId =
          'sideBackground_get';
      }),
    });
    assert.ok(mentions(failures, 'was disturbed'), failures.join('\n'));
  });
});

describe('APP3-P03 — governance', () => {
  it('refuses a new conversion dependency', () => {
    const manifest = JSON.parse(file('apiManifest'));
    manifest.dependencies['nestjs-zod'] = '^4.0.0';
    const failures = run({ [CANONICAL_FILES.apiManifest]: JSON.stringify(manifest, undefined, 2) });
    assert.ok(mentions(failures, 'must not need a new dependency'), failures.join('\n'));
  });

  it('refuses zod being dropped as a dependency', () => {
    const manifest = JSON.parse(file('apiManifest'));
    delete manifest.dependencies.zod;
    const failures = run({ [CANONICAL_FILES.apiManifest]: JSON.stringify(manifest, undefined, 2) });
    assert.ok(mentions(failures, 'no longer depends on zod'), failures.join('\n'));
  });

  it('refuses a root script being added', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts['check:app3-p03'] = 'node tools/check-app3-p03.mjs';
    const failures = run({
      [CANONICAL_FILES.rootManifest]: JSON.stringify(manifest, undefined, 2),
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  for (const command of [
    'CMD-CHECK-APP3-P03',
    'CMD-CHECK-APP3-P03-CONTRACT',
    'CMD-TEST-APP3-P03',
    'CMD-TEST-APP3-P03-CONTRACT',
  ]) {
    it(`refuses ${command} missing from the scoped command index`, () => {
      const failures = run({
        [CANONICAL_FILES.commandIndex]: file('commandIndex').replaceAll(command, 'CMD-REMOVED'),
      });
      assert.ok(mentions(failures, `does not index ${command}`), failures.join('\n'));
    });
  }

  it('refuses the tooling soft caps going unrecorded', () => {
    const failures = run({
      [CANONICAL_FILES.governance]: file('governance').replaceAll('450', '999'),
    });
    assert.ok(mentions(failures, '450-line tooling checker soft cap'), failures.join('\n'));
  });

  it('refuses the application limits being dropped from the record', () => {
    const failures = run({
      [CANONICAL_FILES.governance]: file('governance').replaceAll('400', '450'),
    });
    assert.ok(mentions(failures, '400-line application source limit'), failures.join('\n'));
  });
});

describe('APP3-P03 — the phase records one of exactly two worlds', () => {
  const phaseWith = (...replacements) => {
    let phase = file('phase');
    for (const [from, to] of replacements) {
      assert.ok(phase.includes(from), `phase fixture missing: ${from}`);
      phase = phase.replace(from, to);
    }
    return { [CANONICAL_FILES.phase]: phase };
  };

  it('accepts the undelivered world in full', () => {
    const failures = run(
      phaseWith(
        ['APP3-P03 = COMPLETE — REVIEW_DELIVERED', 'APP3-P03 = READY — NOT STARTED'],
        [
          'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03',
          'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_SCHEMA_BACKED_HTTP_BODY_CHECKPOINTS',
        ],
        ['APP3-B03 = READY — NOT STARTED', 'APP3-B03 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP'],
        ['APP3-B06 = READY — NOT STARTED', 'APP3-B06 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP'],
      ),
      // Only the phase half is exercised: the artifacts on disk are the
      // delivered ones, and the predecessors key their digests on the same line.
      (dir) => runPhaseOnly(dir),
    );
    assert.deepEqual(failures, []);
  });

  it('refuses the follow-up closed while B03 still calls it a blocker', () => {
    const failures = run(
      phaseWith([
        'APP3-B03 = READY — NOT STARTED',
        'APP3-B03 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP',
      ]),
    );
    assert.ok(mentions(failures, 'still records it as their blocker'), failures.join('\n'));
  });

  it('refuses the follow-up closed while the checkpoint is not recorded done', () => {
    const failures = run(
      phaseWith(['APP3-P03 = COMPLETE — REVIEW_DELIVERED', 'APP3-P03 = IN PROGRESS']),
    );
    assert.ok(mentions(failures, 'is not delivered'), failures.join('\n'));
  });

  it('refuses the follow-up left open after delivery', () => {
    const failures = run(
      phaseWith([
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_SCHEMA_BACKED_HTTP_BODY_CHECKPOINTS',
      ]),
    );
    assert.ok(mentions(failures, 'is not closed by it'), failures.join('\n'));
  });

  it('refuses B02 being downgraded from accepted', () => {
    const failures = run(
      phaseWith([
        'APP3-B02 = COMPLETE — REVIEW_ACCEPTED',
        'APP3-B02 = COMPLETE — REVIEW_DELIVERED',
      ]),
    );
    assert.ok(mentions(failures, 'no longer recorded as accepted'), failures.join('\n'));
  });

  it('refuses an invented APP3-B02-C1', () => {
    const failures = run(
      phaseWith([
        'APP3-B02 OPERATION = publicProductSideBackground_get',
        'APP3-B02-C1 = CANCELLED\nAPP3-B02 OPERATION = publicProductSideBackground_get',
      ]),
    );
    assert.ok(mentions(failures, 'was invented'), failures.join('\n'));
  });

  it('refuses the approved tooling-size deviation going unrecorded', () => {
    const failures = run(
      phaseWith([
        'APPROVED_BOUNDED_TOOLING_SIZE_DEVIATION = B02_PREDECESSOR_GATE_AND_TEST_FILES',
        'APPROVED_BOUNDED_TOOLING_SIZE_DEVIATION = SOMETHING_ELSE',
      ]),
    );
    assert.ok(mentions(failures, 'bounded tooling-size deviation'), failures.join('\n'));
  });
});

/**
 * The phase half of the gate, run alone.
 *
 * The undelivered world cannot be asserted through the whole checker: the
 * artifacts on disk are the delivered ones, and `APP3-B01N` keys its OpenAPI and
 * client digests on the same status line — so flipping the phase back would
 * fail on the digests, not on the phase logic being tested.
 */
function runPhaseOnly(dir) {
  return checkApp3P03(dir).filter(
    (failure) =>
      failure.includes('platform follow-up') ||
      failure.includes('APP3-P03 is') ||
      failure.includes('B03') ||
      failure.includes('B06'),
  );
}

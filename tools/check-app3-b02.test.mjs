/**
 * Regressions for the `APP3-B02` gate.
 *
 * Each case breaks exactly one ruled property of public Side-background delivery
 * in a throwaway copy of the repository and proves the checker refuses it. The
 * cases worth reading twice are the ones a later edit would make for
 * convenience and that still compile: a contextual predicate dropped from the
 * query, the object opened before eligibility is proved, the provider's byte
 * count sent when it contradicts the row, a cache lifetime added "for
 * performance", or an Asset-id route added "for debugging". None of those fail
 * loudly at runtime, and each of them turns a publication-gated read into a
 * capability.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as B01_FILES } from './check-app3-b01.mjs';
import { CANONICAL_FILES as B01N_FILES } from './check-app3-b01n.mjs';
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
import { B02_PATH } from './check-app3-b02-contract.mjs';
import { CANONICAL_FILES, REPO_ROOT, checkApp3B02 } from './check-app3-b02.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-B02` chains B01, B01N, W01B and G04, and those chain the whole APP3
 * spine, so the root needs every canonical file those gates read plus real
 * `.git` history for G01's chronology half. Both application source trees are
 * copied because several walks read them: without them a number of checks would
 * pass vacuously.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b02-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
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
function run(edits = {}) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checkApp3B02(dir);
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

describe('APP3-B02 — the delivered route passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3B02(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-B02 — the contextual query proves everything, every request', () => {
  for (const [needle, complaint] of [
    ['eq(products.status, PRODUCT_PUBLISHED_STATE)', 'Product publication'],
    ['isNull(products.archivedAt)', 'the Product archive check'],
    ['eq(categories.status, APP2_CATEGORY_STATUS)', 'Category publication'],
    ['eq(productSides.code, lookup.sideCode)', 'the Side code'],
    ['isNull(productSides.retiredAt)', 'the Side retirement check'],
    ['isNull(assets.deletedAt)', 'the Asset tombstone check'],
    ['eq(assetDerivatives.isWatermarked, false)', 'the unwatermarked rule'],
    ['isNotNull(assetDerivatives.byteSize)', 'the byte size'],
  ]) {
    it(`rejects dropping ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.repository]: file('repository').replace(`${needle},`, ''),
      });
      assert.ok(mentions(failures, `does not prove ${complaint}`), failures.join('\n'));
    });
  }

  it('rejects reaching the Asset by anything but the background association', () => {
    // The join *is* the association: an Asset that is no longer this Side's
    // background must be unreachable, so a replacement takes effect on the next
    // request without anything having to be invalidated.
    const failures = run({
      [CANONICAL_FILES.repository]: file('repository').replace(
        '.innerJoin(assets, eq(assets.id, productSides.backgroundAssetId))',
        '.innerJoin(assets, eq(assets.kind, SIDE_BACKGROUND_ASSET_KIND))',
      ),
    });
    assert.ok(mentions(failures, 'the background association'), failures.join('\n'));
  });

  it('rejects splitting the decision into two statements', () => {
    // Two queries open a window in which an unpublish can commit between the
    // checks, and the earlier one would have proved nothing about the row served.
    const failures = run({
      [CANONICAL_FILES.repository]: `${file('repository')}
export async function extra(db) {
  return this.db
    .select({ id: 1 })
    .from(products);
}
`,
    });
    assert.ok(mentions(failures, 'the decision must be one query'), failures.join('\n'));
  });

  it('rejects opening a transaction across the read', () => {
    const failures = run({
      [CANONICAL_FILES.repository]: file('repository').replace(
        'async findDeliverable(',
        'async findDeliverable_wrapped() { return this.runInTransaction(() => 1); }\n  async findDeliverable(',
      ),
    });
    assert.ok(mentions(failures, 'a stream must not hold one'), failures.join('\n'));
  });

  it('rejects a read path that writes', () => {
    const failures = run({
      [CANONICAL_FILES.repository]: `${file('repository')}\nconst _repair = (db) => db.update(1);\n`,
    });
    assert.ok(mentions(failures, 'a public read repairs nothing'), failures.join('\n'));
  });

  for (const [from, complaint] of [
    [
      'if (widthPx <= 0 || heightPx <= 0 || byteSize <= 0n) return undefined;',
      'the positive-dimension guard',
    ],
    [
      'if (!isDeliverableSideBackgroundMediaType(mediaType)) return undefined;',
      'the approved media-type guard',
    ],
  ]) {
    it(`rejects dropping ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.repository]: file('repository').replace(from, ''),
      });
      assert.ok(mentions(failures, complaint), failures.join('\n'));
    });
  }
});

describe('APP3-B02 — only the raster editor output is deliverable', () => {
  it('rejects admitting SVG as a Side background media type', () => {
    // Widened at the one shared constant, which is where a real widening would
    // happen — the delivery policy only aliases it, so a test that edited the
    // alias would prove nothing about what the manifest advertises.
    const failures = run({
      [CANONICAL_FILES.placementPolicy]: file('placementPolicy').replace(
        "EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES = ['image/webp']",
        "EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES = ['image/webp', 'image/svg+xml']",
      ),
    });
    assert.ok(mentions(failures, 'SVG appears in the delivery policy'), failures.join('\n'));
  });

  it('rejects the delivery policy re-declaring its own media-type list', () => {
    const failures = run({
      [CANONICAL_FILES.policy]: file('policy').replace(
        'PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES = EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES',
        "PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES = ['image/webp'] as const",
      ),
    });
    assert.ok(mentions(failures, 'not the shared placement constant'), failures.join('\n'));
  });

  it('rejects re-declaring a publication constant instead of reusing it', () => {
    const failures = run({
      [CANONICAL_FILES.policy]: file('policy').replace(
        'export {',
        "export const PRODUCT_PUBLISHED_STATE = 'PUBLISHED';\nexport {",
      ),
    });
    assert.ok(mentions(failures, 'as a fresh literal'), failures.join('\n'));
  });
});

describe('APP3-B02 — the stream is a stream', () => {
  it('rejects buffering the object', () => {
    const failures = run({
      [CANONICAL_FILES.service]: `${file('service')}\nconst _all = Buffer.concat([]);\n`,
    });
    assert.ok(mentions(failures, 'buffers the object'), failures.join('\n'));
  });

  it('rejects opening the object before eligibility is proved', () => {
    // The security property: a probe must cost one query and no provider
    // request, so provider load and timing reveal nothing about what exists.
    const source = file('service');
    const reordered = source.replace(
      'const descriptor = await this.backgrounds.findDeliverable({',
      'await this.openObject("k", signal);\n    const descriptor = await this.backgrounds.findDeliverable({',
    );
    const failures = run({ [CANONICAL_FILES.service]: reordered });
    assert.ok(mentions(failures, 'before eligibility is proved'), failures.join('\n'));
  });

  it('rejects a disconnect that does not destroy the upstream body', () => {
    const failures = run({
      [CANONICAL_FILES.controller]: file('controller').replace(
        "addEventListener('abort', () => stream.body.destroy(), { once: true })",
        "addEventListener('abort', () => undefined, { once: true })",
      ),
    });
    assert.ok(mentions(failures, 'does not destroy the upstream body'), failures.join('\n'));
  });

  it('rejects aborting responses that already completed', () => {
    const failures = run({
      [CANONICAL_FILES.controller]: file('controller').replace('!response.writableEnded', 'true'),
    });
    assert.ok(mentions(failures, 'would abort completed responses'), failures.join('\n'));
  });
});

describe('APP3-B02 — the row and the object must agree', () => {
  it('rejects sending the provider length without reconciling it', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replace(
        'providerSize !== descriptor.byteSize',
        'false',
      ),
    });
    assert.ok(mentions(failures, 'not reconciled'), failures.join('\n'));
  });

  it('rejects leaving a contradicted stream open', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replace('result.body.destroy();', ''),
    });
    assert.ok(mentions(failures, 'not torn down'), failures.join('\n'));
  });

  it('rejects a Content-Type taken from anywhere but the persisted media type', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replace(
        'contentType: descriptor.mediaType',
        "contentType: 'image/webp'",
      ),
    });
    assert.ok(mentions(failures, 'not the persisted derivative media type'), failures.join('\n'));
  });
});

describe('APP3-B02 — the response cannot outlive a revocation', () => {
  for (const [from, to, complaint] of [
    [
      "PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL = 'no-store'",
      "PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL = 'max-age=3600'",
      'no-store',
    ],
    [
      "PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS = 'nosniff'",
      "PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS = 'none'",
      'nosniff',
    ],
    [
      "PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION = 'inline'",
      "PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION = 'attachment'",
      'inline disposition',
    ],
  ]) {
    it(`rejects losing ${complaint}`, () => {
      const failures = run({ [CANONICAL_FILES.policy]: file('policy').replace(from, to) });
      assert.ok(mentions(failures, complaint), failures.join('\n'));
    });
  }

  it('rejects exposing a provider ETag', () => {
    const failures = run({
      [CANONICAL_FILES.controller]: file('controller').replace(
        "response.setHeader('Cache-Control'",
        "response.setHeader('ETag', 'x');\n    response.setHeader('Cache-Control'",
      ),
    });
    assert.ok(mentions(failures, 'exposes "ETag"'), failures.join('\n'));
  });
});

describe('APP3-B02 — no generic asset surface', () => {
  it('rejects a presign capability on the delivery path', () => {
    const failures = run({
      [CANONICAL_FILES.controller]: `${file('controller')}\nconst _p = 'presign';\n`,
    });
    assert.ok(mentions(failures, 'offers "presign"'), failures.join('\n'));
  });

  it('rejects a write capability in the delivery module', () => {
    const failures = run({
      [CANONICAL_FILES.service]: `${file('service')}\nconst _w = 'putObjectStream';\n`,
    });
    assert.ok(mentions(failures, 'can write to object storage'), failures.join('\n'));
  });

  it('rejects an unauthorized side-background controller', () => {
    // The rule became mode-aware when `APP3-B02A` added the Admin counterpart,
    // so it now names the controllers the delivered checkpoints own rather than
    // counting them — a count would have been satisfied by this rogue file.
    const failures = run({
      'apps/api/src/modules/catalog/presentation/legacy-side-background.controller.ts':
        'export class LegacySideBackgroundController {}\n',
    });
    assert.ok(mentions(failures, 'expected side-background controllers'), failures.join('\n'));
    assert.ok(mentions(failures, 'legacy-side-background.controller.ts'), failures.join('\n'));
  });
});

describe('APP3-B02 — the published surface is exactly one operation', () => {
  it('rejects a second operation on the delivery path', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths[B02_PATH].delete = { operationId: 'publicProductSideBackground_delete' };
      }),
    });
    assert.ok(mentions(failures, 'exactly one GET is allowed'), failures.join('\n'));
  });

  it('rejects a request body on the operation', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths[B02_PATH].get.requestBody = { content: {} };
      }),
    });
    assert.ok(mentions(failures, 'declares a request body'), failures.join('\n'));
  });

  it('rejects a security requirement on the anonymous operation', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths[B02_PATH].get.security = [{ cookie: [] }];
      }),
    });
    assert.ok(mentions(failures, 'declares a security requirement'), failures.join('\n'));
  });

  it('rejects a query rendition selector', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths[B02_PATH].get.parameters.push({ name: 'rendition', in: 'query' });
      }),
    });
    assert.ok(mentions(failures, 'no rendition selector is allowed'), failures.join('\n'));
  });

  it('rejects an artifact-keyed path', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths['/api/public/products/{slug}/sides/{assetId}/background'] =
          document.paths[B02_PATH];
        delete document.paths[B02_PATH];
      }),
    });
    assert.ok(mentions(failures, 'expected exactly one side path'), failures.join('\n'));
  });

  it('rejects a renamed operation id', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.paths[B02_PATH].get.operationId = 'sideBackground_read';
      }),
    });
    assert.ok(mentions(failures, 'the operation id is'), failures.join('\n'));
  });
});

describe('APP3-B02 — the manifest publishes an address and the intrinsic quartet', () => {
  it('rejects a private identity in the public background schema', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.PublicPlacementBackgroundResponse.properties.backgroundAssetId =
          { type: 'string' };
      }),
    });
    assert.ok(mentions(failures, 'exposes "backgroundAssetId"'), failures.join('\n'));
  });

  it('rejects a delivery block missing a quartet member', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        delete document.components.schemas.PublicPlacementBackgroundDeliveryResponse.properties
          .byteSize;
      }),
    });
    assert.ok(mentions(failures, 'the delivery schema exposes'), failures.join('\n'));
  });

  it('rejects an absolute example address', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        document.components.schemas.PublicPlacementBackgroundDeliveryResponse.properties.path.example =
          'https://cdn.example.com/x.webp';
      }),
    });
    assert.ok(mentions(failures, 'is not relative'), failures.join('\n'));
  });

  it('rejects a delivery block that is not all-or-nothing', () => {
    const failures = run({
      [CANONICAL_FILES.projection]: file('projection').replace(
        'readonly delivery: PublicBackgroundDelivery | null;',
        'readonly delivery?: PublicBackgroundDelivery;',
      ),
    });
    assert.ok(mentions(failures, 'all-or-nothing'), failures.join('\n'));
  });

  it('rejects fabricating a path for a background that is not deliverable', () => {
    const failures = run({
      [CANONICAL_FILES.projection]: file('projection').replace(
        'if (row.background === undefined) {',
        'if (false) {',
      ),
    });
    assert.ok(mentions(failures, 'does not omit delivery'), failures.join('\n'));
  });

  it('rejects substituting the placement canvas for the intrinsic dimensions', () => {
    const failures = run({
      [CANONICAL_FILES.projection]: file('projection').replace(
        'widthPx: row.background.widthPx',
        'widthPx: row.imageWidthPx',
      ),
    });
    assert.ok(mentions(failures, 'placement canvas is substituted'), failures.join('\n'));
  });

  it('rejects reading byte_size as a JSON number', () => {
    const failures = run({
      [CANONICAL_FILES.placementRepository]: file('placementRepository').replace(
        'byte_size::text',
        'byte_size',
      ),
    });
    assert.ok(mentions(failures, 'silent precision loss'), failures.join('\n'));
  });
});

describe('APP3-B02 — one route helper, and the API proven equal to it', () => {
  it('rejects a helper that reaches for a host', () => {
    const failures = run({
      [CANONICAL_FILES.apiPath]: `${file('apiPath')}\nconst _host = process.env;\n`,
    });
    assert.ok(mentions(failures, 'reaches for a host'), failures.join('\n'));
  });

  it('rejects dropping segment encoding', () => {
    const failures = run({
      [CANONICAL_FILES.apiPath]: file('apiPath').replace('encodeURIComponent(slug)', 'slug'),
    });
    assert.ok(mentions(failures, 'does not encode both segments'), failures.join('\n'));
  });

  it('rejects a contracts import in compiled API code', () => {
    // IMP-D018: `node dist/main.js` would die on the import, in the container
    // rather than in any test.
    const failures = run({
      [CANONICAL_FILES.projection]: `import '@embroidery/contracts';\n${file('projection')}`,
    });
    assert.ok(mentions(failures, 'the compiled API cannot load it'), failures.join('\n'));
  });

  it('rejects removing the shared builder from the contracts index', () => {
    const failures = run({
      [CANONICAL_FILES.contractIndex]: file('contractIndex').replaceAll(
        'buildPublicSideBackgroundPath',
        'unexported',
      ),
    });
    assert.ok(mentions(failures, 'not exported from the contracts index'), failures.join('\n'));
  });
});

describe('APP3-B02 — the boundaries it must not cross', () => {
  it('rejects a migration added by this checkpoint', () => {
    const failures = run({ 'packages/database/migrations/9999_b02.sql': 'select 1;\n' });
    assert.ok(mentions(failures, 'APP3-B02 adds none'), failures.join('\n'));
  });

  it('rejects a new root script', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts = { ...manifest.scripts, 'check:app3-b02': 'node tools/check-app3-b02.mjs' };
    const failures = run({
      [CANONICAL_FILES.rootManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixes it at 30'), failures.join('\n'));
  });

  it('rejects removing the accepted APP2-T01 media route', () => {
    const failures = run({
      [CANONICAL_FILES.openapi]: openapiWith((document) => {
        delete document.paths['/api/public/products/{slug}/media/{productMediaId}/{rendition}'];
      }),
    });
    assert.ok(mentions(failures, 'accepted APP2-T01 media route is gone'), failures.join('\n'));
  });

  it('rejects reopening the public-dimensions follow-up', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: file('phase').replace(
        'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = COMPLETE — CLOSED_BY_APP3-B02',
        'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — FINAL_OWNER_APP3-B02',
      ),
    });
    assert.ok(mentions(failures, 'not closed by this checkpoint'), failures.join('\n'));
  });

  it('rejects closing the platform body follow-up here', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: file('phase').replace(
        /FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_[A-Z_]+/,
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE',
      ),
    });
    assert.ok(mentions(failures, 'was closed or altered'), failures.join('\n'));
  });

  it('rejects an audit or outbox import in the public delivery module', () => {
    const failures = run({
      [CANONICAL_FILES.module]: `${file('module')}\nconst _a = 'AuditContextModule';\n`,
    });
    assert.ok(mentions(failures, 'imports "AuditContextModule"'), failures.join('\n'));
  });

  it('rejects a command that is not in the scoped index', () => {
    const failures = run({
      [CANONICAL_FILES.commandIndex]: file('commandIndex').replace(
        'CMD-TEST-APP3-B02-INTEGRATION',
        'CMD-TEST-APP3-B02-REMOVED',
      ),
    });
    assert.ok(mentions(failures, 'CMD-TEST-APP3-B02-INTEGRATION is not'), failures.join('\n'));
  });
});

describe('APP3-B02 — the corpus proves revocation, not only the happy path', () => {
  for (const [needle, complaint] of [
    ['stops serving the moment the product is unpublished', 'unpublish revocation'],
    ['stops serving once the side is retired', 'side retirement'],
    ['serves the replacement, never the replaced object', 'background replacement'],
    ['provider size contradicts the row', 'the size contradiction'],
    ['appends no audit, outbox or domain row', 'the read path writing nothing'],
  ]) {
    it(`rejects a live-stack suite with no coverage of ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.integration]: file('integration').replaceAll(needle, 'REMOVED'),
      });
      assert.ok(mentions(failures, `does not cover ${complaint}`), failures.join('\n'));
    });
  }

  it('rejects a service suite that never proves the probe ordering', () => {
    const failures = run({
      [CANONICAL_FILES.serviceSpec]: file('serviceSpec').replaceAll(
        'never reaches the provider when nothing is deliverable',
        'REMOVED',
      ),
    });
    assert.ok(mentions(failures, 'does not cover the probe ordering'), failures.join('\n'));
  });
});

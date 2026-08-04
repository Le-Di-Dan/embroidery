/**
 * Regressions for the `APP3-B01` gate.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The behaviour of placement
 * itself is the API's own unit, contract and live-database suites; what these
 * guard is the seam between the ruling and the delivered contract.
 *
 * The cases worth reading twice are the ones that would otherwise ship
 * silently: a background asset id added to the public schema, an anonymous
 * manifest that quietly grew an Admin session requirement, a retired-row filter
 * dropped from the public query, and a `width / mm` check written inline instead
 * of delegated to `design-engine`. All four compile, and all four pass every
 * functional test.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, REPO_ROOT, checkApp3B01 } from './check-app3-b01.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * The gate chains P02 → G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01, so the
 * root needs every canonical file those gates read plus real `.git` history for
 * G01's chronology half. `node:test` runs subtests sequentially, so applying an
 * edit and putting the original back is safe.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b01-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
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
    'apps/api/src/modules/catalog',
    'packages/design-engine/src',
    DOCUMENT_SRC,
    'packages/database/migrations',
    'apps/api/src/modules/design',
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
    return checkApp3B01(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const openapi = () => JSON.parse(read(CANONICAL_FILES.openapi));
const withOpenApi = (mutate) => {
  const document = openapi();
  mutate(document);
  return { [CANONICAL_FILES.openapi]: JSON.stringify(document, null, 2) };
};
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

const ADMIN_PATH = '/api/admin/products/{productId}/placement';
const PUBLIC_PATH = '/api/public/products/{slug}/placement';

describe('APP3-B01 — the delivered checkpoint passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3B01(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-B01 — exactly three operations', () => {
  it('rejects a fourth placement path', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths['/api/public/products/{slug}/placement/preview'] = {
          get: { operationId: 'publicProductPlacement_preview' },
        };
      }),
    );
    assert.ok(mentions(failures, 'is not one of the three'), failures.join('\n'));
  });

  it('rejects a fourth method on a ruled path', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths[ADMIN_PATH].delete = { operationId: 'adminProductPlacement_clear' };
      }),
    );
    assert.ok(mentions(failures, 'unruled fourth operation'), failures.join('\n'));
  });

  it('rejects a renamed operation id', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths[PUBLIC_PATH].get.operationId = 'publicPlacement_read';
      }),
    );
    assert.ok(mentions(failures, 'expected publicProductPlacement_get'), failures.join('\n'));
  });

  it('rejects a missing ruled operation', () => {
    const failures = run(
      withOpenApi((document) => {
        delete document.paths[ADMIN_PATH].put;
      }),
    );
    assert.ok(mentions(failures, 'PUT'), failures.join('\n'));
  });

  it('rejects an operation belonging to a checkpoint that has not run', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths['/api/public/design-sessions/{sessionId}'] = {
          get: { operationId: 'publicDesignSession_get' },
        };
      }),
    );
    assert.ok(mentions(failures, 'has not run'), failures.join('\n'));
  });
});

describe('APP3-B01 — the authentication boundary', () => {
  it('rejects an Admin operation that lost its session requirement', () => {
    const failures = run(
      withOpenApi((document) => {
        delete document.paths[ADMIN_PATH].get.security;
      }),
    );
    assert.ok(mentions(failures, 'wrong authentication contract'), failures.join('\n'));
  });

  it('rejects a manifest that quietly became authenticated', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths[PUBLIC_PATH].get.security = [{ adminSession: [] }];
      }),
    );
    assert.ok(mentions(failures, 'wrong authentication contract'), failures.join('\n'));
  });
});

describe('APP3-B01 — the public surface', () => {
  it('rejects a private field added to a public schema', () => {
    for (const field of ['backgroundAssetId', 'retiredAt', 'storageKey']) {
      const failures = run(
        withOpenApi((document) => {
          document.components.schemas.PublicPlacementSideResponse.properties[field] = {
            type: 'string',
          };
        }),
      );
      assert.ok(mentions(failures, `exposes "${field}"`), `expected a failure for ${field}`);
    }
  });

  it('rejects dropping the retired-row filter from the public query', () => {
    const source = read(CANONICAL_FILES.repository);
    const failures = run({
      [CANONICAL_FILES.repository]: source.replace('isNull(productSides.retiredAt)', 'sql`true`'),
    });
    assert.ok(mentions(failures, 'does not exclude retired sides'), failures.join('\n'));
  });
});

describe('APP3-B01 — ownership and boundaries', () => {
  it('rejects a Design module import', () => {
    const source = read(CANONICAL_FILES.service);
    const failures = run({
      [CANONICAL_FILES.service]: `import { x } from '../../design/design.module';\n${source}`,
    });
    assert.ok(mentions(failures, 'Catalog authority'), failures.join('\n'));
  });

  it('rejects an object-storage or decoder call', () => {
    const source = read(CANONICAL_FILES.repository);
    const failures = run({
      [CANONICAL_FILES.repository]: `${source}\nconst _probe = 'presign';\n`,
    });
    assert.ok(mentions(failures, 'reaches object storage'), failures.join('\n'));
  });

  it('rejects a placement module that is never composed', () => {
    const source = read(CANONICAL_FILES.appModule);
    const failures = run({
      [CANONICAL_FILES.appModule]: source.replaceAll('CatalogPlacementModule', 'DisabledModule'),
    });
    assert.ok(mentions(failures, 'is not composed'), failures.join('\n'));
  });
});

describe('APP3-B01 — eligibility cannot weaken', () => {
  it('rejects dropping any part of the canonical quartet', () => {
    for (const column of ['width_px', 'height_px', 'media_type', 'byte_size']) {
      const source = read(CANONICAL_FILES.repository);
      const failures = run({
        [CANONICAL_FILES.repository]: source.replace(`and bg_derivative.${column} is not null`, ''),
      });
      assert.ok(
        mentions(failures, `does not require ${column}`),
        `expected a failure for ${column}`,
      );
    }
  });

  it('rejects dropping the unwatermarked or tombstone condition', () => {
    for (const [fragment, complaint] of [
      ['and bg_derivative.is_watermarked = false', 'unwatermarked requirement'],
      ['and bg_asset.deleted_at is null', 'tombstone check'],
    ]) {
      const source = read(CANONICAL_FILES.repository);
      const failures = run({ [CANONICAL_FILES.repository]: source.replace(fragment, '') });
      assert.ok(mentions(failures, complaint), `expected a failure for ${fragment}`);
    }
  });

  it('rejects a non-editor-safe derivative kind', () => {
    const source = read(CANONICAL_FILES.policy);
    const failures = run({
      [CANONICAL_FILES.policy]: source.replace(
        "EDITOR_SAFE_DERIVATIVE_KIND = 'NORMALIZED'",
        "EDITOR_SAFE_DERIVATIVE_KIND = 'CATALOG_PREVIEW'",
      ),
    });
    assert.ok(mentions(failures, 'not NORMALIZED'), failures.join('\n'));
  });

  it('rejects accepting SVG as a side background', () => {
    const source = read(CANONICAL_FILES.policy);
    const failures = run({
      [CANONICAL_FILES.policy]: source.replace(
        "REJECTED_SIDE_BACKGROUND_MEDIA_TYPE = 'image/svg+xml'",
        "REJECTED_SIDE_BACKGROUND_MEDIA_TYPE = 'image/tiff'",
      ),
    });
    assert.ok(mentions(failures, 'SVG is not refused'), failures.join('\n'));
  });

  it('rejects losing the background association from the schema', () => {
    const source = read(CANONICAL_FILES.productSides);
    const failures = run({
      [CANONICAL_FILES.productSides]: source.replace(
        "backgroundAssetId: idReference('background_asset_id').notNull()",
        "backgroundAssetId: idReference('background_asset_id')",
      ),
    });
    assert.ok(mentions(failures, 'no longer carries background_asset_id'), failures.join('\n'));
  });
});

describe('APP3-B01 — geometry and DB01 authority', () => {
  it('rejects dropping the design-engine dependency', () => {
    const source = read(CANONICAL_FILES.geometry);
    const failures = run({
      [CANONICAL_FILES.geometry]: source.replace(
        "from '@embroidery/design-engine'",
        "from './local-geometry'",
      ),
    });
    assert.ok(mentions(failures, 'does not use @embroidery/design-engine'), failures.join('\n'));
  });

  it('rejects px/mm geometry re-implemented outside the seam', () => {
    const source = read(CANONICAL_FILES.plan);
    const failures = run({
      [CANONICAL_FILES.plan]: `${source}\nconst _scale = (s) => s.imageWidthPx / s.physicalWidthMm;\n`,
    });
    assert.ok(mentions(failures, 're-implements px/mm geometry'), failures.join('\n'));
  });

  it('rejects a placement repository that deletes a row', () => {
    const source = read(CANONICAL_FILES.repository);
    const failures = run({
      [CANONICAL_FILES.repository]: `${source}\nconst _purge = (db, t) => db.delete(t);\n`,
    });
    assert.ok(mentions(failures, 'retirement is the removal path'), failures.join('\n'));
  });

  it('rejects losing the referenced-placement guard translation', () => {
    const source = read(CANONICAL_FILES.service);
    const failures = run({
      [CANONICAL_FILES.service]: source.replace("case '23000':", "case '23999':"),
    });
    assert.ok(mentions(failures, 'not translated to a stable error'), failures.join('\n'));
  });
});

/**
 * `APP3-B01-C1`. The delivered checkpoint enforced the compare-and-set and
 * published the replace body as an **empty object**, so a client could not
 * discover the token it was required to send. Every case here breaks one half of
 * the published contract; none of them breaks a functional test.
 */
describe('APP3-B01 — the concurrency contract is published', () => {
  it('rejects a replace body that documents no token', () => {
    for (const mutate of [
      (document) =>
        delete document.components.schemas.ReplaceProductPlacementBody.properties.expectedUpdatedAt,
      (document) => {
        document.components.schemas.ReplaceProductPlacementBody.required = ['sides'];
      },
    ]) {
      const failures = run(withOpenApi(mutate));
      assert.ok(
        mentions(failures, 'expectedUpdatedAt'),
        `expected a token failure\n${failures.join('\n')}`,
      );
    }
  });

  it('rejects the empty published body that originally shipped', () => {
    const failures = run(
      withOpenApi((document) => {
        document.components.schemas.ReplaceProductPlacementBody.properties = {};
        document.components.schemas.ReplaceProductPlacementBody.required = [];
      }),
    );
    assert.ok(mentions(failures, 'publishes no properties at all'), failures.join('\n'));
  });

  it('rejects an Admin read that stops returning the token', () => {
    const failures = run(
      withOpenApi((document) => {
        delete document.components.schemas.AdminProductPlacementResponse.properties.updatedAt;
      }),
    );
    assert.ok(mentions(failures, 'does not expose `updatedAt`'), failures.join('\n'));
  });

  it('rejects an optional token on either side', () => {
    const failures = run(
      withOpenApi((document) => {
        document.components.schemas.AdminProductPlacementResponse.required = [
          'productId',
          'productStatus',
          'sides',
        ];
      }),
    );
    assert.ok(
      mentions(failures, 'is optional in the Admin placement response'),
      failures.join('\n'),
    );
  });

  it('rejects a replace that stops returning the fresh token', () => {
    const failures = run(
      withOpenApi((document) => {
        document.paths[ADMIN_PATH].put.responses['200'] = { description: 'No content.' };
      }),
    );
    assert.ok(mentions(failures, 'fresh token'), failures.join('\n'));
  });

  it('rejects the token leaking into the public manifest', () => {
    const failures = run(
      withOpenApi((document) => {
        document.components.schemas.PublicProductPlacementResponse.properties.updatedAt = {
          type: 'string',
        };
      }),
    );
    assert.ok(mentions(failures, 'public manifest exposes'), failures.join('\n'));
  });

  it('rejects a token format that diverges from the Catalog convention', () => {
    // A bare `datetime()` refuses `+07:00`, which every other Admin Product
    // write accepts — one column, two rules.
    const source = read(CANONICAL_FILES.request);
    const failures = run({
      [CANONICAL_FILES.request]: source.replace(
        'z.string().datetime({ offset: true })',
        'z.string().datetime()',
      ),
    });
    assert.ok(mentions(failures, 'offset: true'), failures.join('\n'));
  });

  it('rejects an optional token in the request schema', () => {
    const source = read(CANONICAL_FILES.request);
    const failures = run({
      [CANONICAL_FILES.request]: source.replace(
        'expectedUpdatedAt: z.string().datetime({ offset: true })',
        'expectedUpdatedAt: z.string().datetime({ offset: true }).optional()',
      ),
    });
    assert.ok(mentions(failures, 'optional in the request schema'), failures.join('\n'));
  });

  it('rejects a compare-and-set that no longer compares the caller token', () => {
    const source = read(CANONICAL_FILES.repository);
    const failures = run({
      [CANONICAL_FILES.repository]: source.replace(
        'eq(products.updatedAt, expectedUpdatedAt)',
        'sql`true`',
      ),
    });
    assert.ok(mentions(failures, 'does not compare the caller token'), failures.join('\n'));
  });

  it('rejects placement writes ordered before the compare-and-set', () => {
    const source = read(CANONICAL_FILES.service);
    const failures = run({
      [CANONICAL_FILES.service]: source.replace(
        'const lock = await this.placement.lockProductForReplace(',
        'await this.apply(await this.plannedFor(productId));\n      const lock = await this.placement.lockProductForReplace(',
      ),
    });
    assert.ok(mentions(failures, 'opening write'), failures.join('\n'));
  });

  it('rejects a stale write that stops mapping to the safe error', () => {
    const source = read(CANONICAL_FILES.errors);
    const failures = run({
      [CANONICAL_FILES.errors]: source.replaceAll(
        "'PLACEMENT_VERSION_CONFLICT'",
        "'PLACEMENT_STALE'",
      ),
    });
    assert.ok(mentions(failures, 'PLACEMENT_VERSION_CONFLICT'), failures.join('\n'));
  });

  it('rejects a generated client that cannot type the token', () => {
    const source = read(CANONICAL_FILES.clientSchemas);
    const failures = run({
      [CANONICAL_FILES.clientSchemas]: source.replace(
        'expectedUpdatedAt: string;',
        'legacyToken: string;',
      ),
    });
    assert.ok(mentions(failures, 'does not type `expectedUpdatedAt`'), failures.join('\n'));
  });

  it('rejects removing a focused concurrency regression', () => {
    const source = read(CANONICAL_FILES.concurrencySpec);
    const failures = run({
      [CANONICAL_FILES.concurrencySpec]: source.replace(
        'writes no side or area when the compare-and-set fails',
        'does something',
      ),
    });
    assert.ok(mentions(failures, 'concurrency regression'), failures.join('\n'));
  });
});

describe('APP3-B01 — artifacts and governance', () => {
  it('rejects a stale generated client', () => {
    const source = read(CANONICAL_FILES.client);
    const failures = run({
      [CANONICAL_FILES.client]: source.replaceAll('publicProductPlacementGet', 'legacyName'),
    });
    assert.ok(mentions(failures, 'does not carry publicProductPlacementGet'), failures.join('\n'));
  });

  it('rejects a new root package.json script', () => {
    const manifest = JSON.parse(read(CANONICAL_FILES.rootManifest));
    manifest.scripts['check:app3-b01'] = 'node tools/check-app3-b01.mjs';
    const failures = run({
      [CANONICAL_FILES.rootManifest]: JSON.stringify(manifest, null, 2),
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  it('rejects an unindexed checkpoint command', () => {
    const source = read(CANONICAL_FILES.commandIndex);
    const failures = run({
      [CANONICAL_FILES.commandIndex]: source.replaceAll('CMD-TEST-APP3-B01-INTEGRATION', 'CMD-X'),
    });
    assert.ok(
      mentions(failures, 'does not index CMD-TEST-APP3-B01-INTEGRATION'),
      failures.join('\n'),
    );
  });

  it('reports an APP3-P02 regression from the gates it chains', () => {
    const source = read(P02_FILES.matrix);
    const failures = run({ [P02_FILES.matrix]: source.replace('b: sin,', 'b: normalize(-sin),') });
    assert.ok(mentions(failures, 'APP3-P02 regression'), failures.join('\n'));
  });
});

/**
 * Regressions for the `APP3-B02A` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working route**:
 *
 *  - a publication predicate reintroduced into the Admin query — the route still
 *    serves published products perfectly and silently stops serving the drafts
 *    `APP3-A01` exists to author;
 *  - the membership join dropped — every legitimate request still succeeds, and
 *    a Side of another Product starts resolving too;
 *  - the guard removed — every authenticated test still passes, and an
 *    unpublished product's media becomes world-readable;
 *  - object storage opened before the contextual read — the bytes are identical
 *    and the route becomes a timing oracle for ids that do not exist.
 *
 * None of those is visible in a response body, which is why they are checked
 * mechanically rather than left to review.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  OPERATION_ID,
  REPO_ROOT,
  ROUTE,
  checkApp3B02a,
} from './check-app3-b02a.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-b02a-base-'));
  temporaries.push(pristine);
  for (const relative of Object.values(CANONICAL_FILES)) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target);
  }
  return pristine;
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-b02a-'));
  temporaries.push(dir);
  cpSync(baseRoot(), dir, { recursive: true });
  return dir;
}

const at = (root, key) => join(root, CANONICAL_FILES[key]);
const readAt = (root, key) => readFileSync(at(root, key), 'utf8');
const writeAt = (root, key, text) => {
  writeFileSync(at(root, key), text);
};

/** Replaces `from` with `to`, refusing a mutation that would be a no-op. */
function edit(root, key, from, to) {
  const text = readAt(root, key);
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `mutation anchor must be unique in ${key} (found ${count})`);
  writeAt(root, key, text.replace(from, to));
}

/** Mutates a copy and asserts the gate refuses it, naming the rule that fired. */
function refuses(mutate, needle) {
  const root = scratch();
  mutate(root);
  const findings = checkApp3B02a(root);
  assert.ok(findings.length > 0, 'expected the gate to report a finding');
  assert.ok(
    findings.some((finding) => finding.includes(needle)),
    `expected a finding mentioning "${needle}", got:\n${findings.join('\n')}`,
  );
}

describe('baseline', () => {
  it('passes against an unmutated copy of the repository', () => {
    assert.deepEqual(checkApp3B02a(scratch()), []);
  });

  it('passes against the real repository', () => {
    assert.deepEqual(checkApp3B02a(REPO_ROOT), []);
  });
});

describe('entry authority', () => {
  it('refuses an unaccepted B02 parent', () => {
    refuses(
      (root) =>
        edit(
          root,
          'phasePlan',
          '\nAPP3-B02 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-B02 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-B02 is not recorded as accepted',
    );
  });

  it('refuses a missing A01 background-preview blocker', () => {
    // A JIT child whose parent blocker vanished is scope nobody asked for.
    refuses(
      (root) =>
        edit(
          root,
          'phasePlan',
          'A01_REVIEW_BLOCKER = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE',
          'A01_REVIEW_BLOCKER = NONE',
        ),
      'blocker this checkpoint unblocks is not recorded',
    );
  });
});

describe('one protected operation', () => {
  it('refuses a second operation on the controller', () => {
    refuses(
      (root) =>
        edit(
          root,
          'controller',
          '  @Get()\n',
          '  @Post()\n  async other(): Promise<void> {}\n\n  @Get()\n',
        ),
      'declares 2 operations',
    );
  });

  it('refuses a route that drifts from the derived Admin spelling', () => {
    refuses(
      (root) =>
        edit(
          root,
          'controller',
          "@Controller('admin/products/:productId/sides/:sideId/background')",
          "@Controller('admin/side-backgrounds/:sideId')",
        ),
      'does not declare the derived Admin route',
    );
  });

  it('refuses a route with no authenticated Admin guard', () => {
    // Every authenticated test still passes; the media becomes world-readable.
    refuses(
      (root) => edit(root, 'controller', '@UseGuards(AuthenticatedAdminGuard)\n', ''),
      'not behind AuthenticatedAdminGuard',
    );
  });

  it('refuses params that are not two strict UUIDs', () => {
    refuses(
      (root) => edit(root, 'params', 'productId: z.string().uuid(),', 'productId: z.string(),'),
      'does not pin productId to a UUID',
    );
  });
});

describe('authorization predicates', () => {
  it('refuses a query that stops joining the Side to its Product', () => {
    refuses(
      (root) =>
        edit(
          root,
          'repository',
          'eq(productSides.productId, products.id)',
          'eq(productSides.id, productSides.id)',
        ),
      'does not join the Side to its Product',
    );
  });

  it('refuses a reintroduced Product publication predicate', () => {
    // The route keeps working for published products and silently stops
    // serving the drafts A01 exists to author.
    refuses(
      (root) =>
        edit(
          root,
          'repository',
          'eq(products.id, lookup.productId),',
          'eq(products.id, lookup.productId),\n          eq(products.status, PRODUCT_PUBLISHED_STATE),',
        ),
      'imposes a public-visibility predicate',
    );
  });

  it('refuses a reintroduced Category visibility predicate', () => {
    refuses(
      (root) =>
        edit(
          root,
          'repository',
          'const { products, productSides, assets, assetDerivatives } = schema;',
          'const { products, productSides, assets, assetDerivatives, categories } = schema;',
        ),
      'imposes a public-visibility predicate',
    );
  });

  it('refuses dropping the Asset lane re-proof', () => {
    refuses(
      (root) => edit(root, 'repository', 'eq(assets.status, SIDE_BACKGROUND_ASSET_STATUS),\n', ''),
      'does not re-prove SIDE_BACKGROUND_ASSET_STATUS',
    );
  });

  it('refuses serving a watermarked artifact', () => {
    refuses(
      (root) => edit(root, 'repository', 'eq(assetDerivatives.isWatermarked, false),\n', ''),
      'does not exclude watermarked artifacts',
    );
  });

  it('refuses serving a tombstoned Asset', () => {
    refuses(
      (root) => edit(root, 'repository', 'isNull(assets.deletedAt),\n', ''),
      'does not exclude tombstoned Assets',
    );
  });
});

describe('media policy reuse', () => {
  it('refuses a policy that re-declares a constant as a fresh literal', () => {
    refuses(
      (root) =>
        edit(
          root,
          'policy',
          "} from './public-side-background.policy';\n\nexport {\n  /** The W01A raster output",
          "} from './public-side-background.policy';\n\nexport const EDITOR_SAFE_DERIVATIVE_KIND = 'NORMALIZED';\n\nexport {\n  /** The W01A raster output",
        ),
      'declares a media constant of its own',
    );
  });

  it('refuses SVG entering the Admin delivery policy', () => {
    refuses(
      (root) =>
        `${writeAt(root, 'policy', `${readAt(root, 'policy')}\nexport const SVG_OK = 1;\n`)}`,
      'SVG appears in the Admin delivery policy',
    );
  });
});

describe('delivery invariants', () => {
  it('refuses opening storage before the contextual read', () => {
    // Identical bytes; the route becomes a timing oracle for absent ids.
    refuses((root) => {
      const source = readAt(root, 'service');
      const reordered = source.replace(
        'const descriptor = await this.backgrounds.findDeliverable({',
        'await this.storage.getObjectStream({ bucket: 1, key: 2 }, signal);\n    const descriptor = await this.backgrounds.findDeliverable({',
      );
      writeAt(root, 'service', reordered);
    }, 'reaches object storage before the contextual read');
  });

  it('refuses dropping the provider/database size reconciliation', () => {
    refuses(
      (root) => edit(root, 'service', 'providerSize !== descriptor.byteSize', 'false'),
      'does not reconcile the provider count',
    );
  });

  it('refuses leaving a contradicted stream open', () => {
    refuses(
      (root) => edit(root, 'service', 'result.body.destroy();\n', ''),
      'does not destroy the stream',
    );
  });

  it("refuses sending the parent Asset's media type", () => {
    refuses(
      (root) =>
        edit(root, 'service', 'contentType: descriptor.mediaType', "contentType: 'image/png'"),
      'does not send the derivative',
    );
  });

  it('refuses a Range or ETag surface B02 does not have', () => {
    refuses(
      (root) =>
        edit(
          root,
          'controller',
          "response.setHeader('Cache-Control'",
          "response.setHeader('ETag', 'x');\n    response.setHeader('Cache-Control'",
        ),
      'adds a media protocol surface',
    );
  });
});

describe('capabilities the route must never grow', () => {
  it('refuses a presign capability', () => {
    refuses(
      (root) =>
        writeAt(
          root,
          'service',
          `${readAt(root, 'service')}\n// getSignedUrl\nexport const x = 1;\n`.replace(
            '// getSignedUrl',
            'export const y = "getSignedUrl";',
          ),
        ),
      'exposes getSignedUrl',
    );
  });

  it('refuses reading from the private originals bucket', () => {
    // Scoped to the call site: the constant also appears in the import list.
    refuses(
      (root) =>
        edit(
          root,
          'service',
          '{ bucket: ADMIN_SIDE_BACKGROUND_BUCKET, key: storageKey }',
          "{ bucket: 'ORIGINALS', key: storageKey }",
        ),
      'exposes ORIGINALS',
    );
  });

  it('refuses acquiring the placement write capability', () => {
    refuses(
      (root) =>
        edit(
          root,
          'module',
          'imports: [DatabaseModule, ObjectStorageModule, IdentityModule]',
          'imports: [DatabaseModule, ObjectStorageModule, IdentityModule, CatalogPlacementModule]',
        ),
      'imports CatalogPlacementModule',
    );
  });

  it('refuses a module that never reaches the composition root', () => {
    refuses(
      (root) => edit(root, 'appModule', 'CatalogAdminSideBackgroundModule,\n', ''),
      'not composed into the application root',
    );
  });
});

describe('published contract', () => {
  it('refuses a surface that is not exactly +1 path', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, 'openapi'));
      document.paths['/api/admin/extra'] = { get: { operationId: 'extra_get', responses: {} } };
      writeAt(root, 'openapi', JSON.stringify(document));
      // The expected total now comes from the accepted-surface authority, so the
      // mutation is 'one more than whatever the current world publishes'.
    }, 'publishes 34 paths');
  });

  it('refuses a withdrawn operation', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, 'openapi'));
      delete document.paths[ROUTE];
      writeAt(root, 'openapi', JSON.stringify(document));
    }, 'publishes 32 paths');
  });

  it('refuses a drifted operation id', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, 'openapi'));
      document.paths[ROUTE].get.operationId = 'adminSideBackground_read';
      writeAt(root, 'openapi', JSON.stringify(document));
    }, 'published operation id is');
  });

  it('refuses a JSON response where bytes belong', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, 'openapi'));
      document.paths[ROUTE].get.responses['200'].content = {
        'application/json': { schema: { type: 'object' } },
      };
      writeAt(root, 'openapi', JSON.stringify(document));
    }, 'not a concrete binary media type');
  });

  it('refuses an operation that does not publish its unauthenticated refusal', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, 'openapi'));
      delete document.paths[ROUTE].get.responses['401'];
      writeAt(root, 'openapi', JSON.stringify(document));
    }, 'does not publish its unauthenticated refusal');
  });

  it('refuses a client that lost the blob convention', () => {
    // Three operations now stream blobs, so the mutation is scoped to this
    // one's URL template rather than to the shared `responseType` literal.
    refuses(
      (root) =>
        edit(
          root,
          'client',
          "/sides/${sideId}/background`,\n      method: 'GET',\n      responseType: 'blob',",
          "/sides/${sideId}/background`,\n      method: 'GET',",
        ),
      'blob convention',
    );
  });

  it('names the operation the client must expose', () => {
    // A spelling guard: the id is the contract the generated client is built on.
    assert.equal(OPERATION_ID, 'adminProductSideBackground_get');
  });
});

describe('governance', () => {
  it('refuses a new root package.json script', () => {
    refuses((root) => {
      const manifest = JSON.parse(readAt(root, 'rootManifest'));
      manifest.scripts['check:app3-b02a'] = 'node tools/check-app3-b02a.mjs';
      writeAt(root, 'rootManifest', `${JSON.stringify(manifest, null, 2)}\n`);
    }, 'root scripts changed to 31');
  });

  it('refuses unregistered scoped commands', () => {
    refuses(
      (root) => edit(root, 'commandIndex', 'CMD-TEST-APP3-B02A-INTEGRATION', 'CMD-REMOVED'),
      'CMD-TEST-APP3-B02A-INTEGRATION is not registered',
    );
  });
});

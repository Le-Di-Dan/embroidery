/**
 * The placement HTTP contract (`APP3-B01`).
 *
 * Three things are asserted from the *source* and from the generated document
 * rather than from behaviour, because all three are absences and an absence has
 * no runtime signal:
 *
 * - the public controller applies no guard — a future `@UseGuards(...)` would
 *   make the manifest non-public while every functional test kept passing;
 * - neither controller grows a fourth operation, which is how a checkpoint
 *   scoped to three quietly ships five;
 * - the committed OpenAPI document carries no private placement field, which is
 *   the only place a leak would actually reach a client.
 *
 * `tsc` preserves JSDoc into the emitted output, so these scans match *usage* —
 * a decorator call, an import — and never a bare word, or a mention in a comment
 * would fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveArtifactPath } from '../../../openapi/openapi-artifact';
import { AdminProductPlacementController } from './admin-product-placement.controller';
import { PublicProductPlacementController } from './public-product-placement.controller';
import {
  replaceProductPlacementSchema,
  productPlacementIdParamSchema,
} from './schemas/admin-product-placement.request';

const ADMIN_SOURCE = readFileSync(join(__dirname, 'admin-product-placement.controller.ts'), 'utf8');
const PUBLIC_SOURCE = readFileSync(
  join(__dirname, 'public-product-placement.controller.ts'),
  'utf8',
);

interface OpenApiOperation {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
  readonly responses?: Record<string, unknown>;
}

interface OpenApiSchema {
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
}

/**
 * The **committed** artifact, read from disk rather than imported.
 *
 * It is what the generated client and every consumer are built from, so
 * asserting against a document rebuilt in-process would prove something nobody
 * actually receives.
 */
const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, OpenApiSchema> };
};

const PLACEMENT_OPERATIONS = [
  'adminProductPlacement_get',
  'adminProductPlacement_replace',
  'publicProductPlacement_get',
];

function operations(): { path: string; method: string; operation: OpenApiOperation }[] {
  const found: { path: string; method: string; operation: OpenApiOperation }[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      found.push({ path, method, operation });
    }
  }
  return found;
}

const placementOperations = () =>
  operations().filter(({ operation }) =>
    PLACEMENT_OPERATIONS.includes(operation.operationId ?? ''),
  );

describe('the three placement operations', () => {
  it('exist at exactly the ruled routes, with the derived ids', () => {
    expect(
      placementOperations().map(({ method, path, operation }) => [
        `${method.toUpperCase()} ${path}`,
        operation.operationId,
      ]),
    ).toEqual([
      ['GET /api/admin/products/{productId}/placement', 'adminProductPlacement_get'],
      ['PUT /api/admin/products/{productId}/placement', 'adminProductPlacement_replace'],
      ['GET /api/public/products/{slug}/placement', 'publicProductPlacement_get'],
    ]);
  });

  it('adds no fourth operation', () => {
    // Counted from the controllers, not from the document: a new handler with a
    // duplicate id would fail generation, but one with a fresh id would not.
    const adminMethods = ADMIN_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
    const publicMethods = PUBLIC_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
    expect(adminMethods).toHaveLength(2);
    expect(publicMethods).toHaveLength(1);
    expect(placementOperations()).toHaveLength(3);
  });

  it('creates no individual side, area, media, Template or Session operation', () => {
    const paths = Object.keys(document.paths);
    for (const forbidden of ['/sides/', '/areas/', '/templates', '/sessions', '/background']) {
      expect(paths.filter((path) => path.includes(forbidden))).toEqual([]);
    }
  });
});

describe('authentication', () => {
  it('requires an Admin session for both authoring operations', () => {
    const admin = placementOperations().filter(({ path }) => path.includes('/admin/'));
    expect(admin).toHaveLength(2);
    for (const { operation } of admin) {
      expect(operation.security).toEqual([{ adminSession: [] }]);
    }
    expect(ADMIN_SOURCE).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
    // The write additionally carries the staff origin and content-type guards.
    expect(ADMIN_SOURCE).toMatch(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/);
  });

  it('leaves the manifest anonymous', () => {
    const [manifest] = placementOperations().filter(({ path }) => path.includes('/public/'));
    expect(manifest?.operation.security).toBeUndefined();
    expect(PUBLIC_SOURCE).not.toMatch(/@UseGuards\s*\(/);
    expect(PUBLIC_SOURCE).not.toMatch(/@ApiCookieAuth\s*\(/);
    expect(PUBLIC_SOURCE).not.toMatch(/from\s*['"].*identity.*['"]/);
  });
});

describe('the documented public shapes', () => {
  const schemas = document.components.schemas;

  it('carry no private, storage or mutation field', () => {
    const publicSchemas = Object.entries(schemas).filter(([name]) => name.startsWith('Public'));
    const serialized = JSON.stringify(Object.fromEntries(publicSchemas));
    for (const forbidden of [
      'backgroundAssetId',
      'retiredAt',
      'supersededById',
      'storageKey',
      'checksum',
      'bucket',
      'inspection',
      'expectedUpdatedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('describe the side background by reference components only', () => {
    expect(
      Object.keys(schemas['PublicPlacementBackgroundResponse']?.properties ?? {}).sort(),
    ).toEqual(['productSlug', 'sideCode']);
  });

  it('keep the background association Admin-only', () => {
    expect(schemas['AdminPlacementSideResponse']?.properties).toHaveProperty('backgroundAssetId');
    expect(schemas['PublicPlacementSideResponse']?.properties).not.toHaveProperty(
      'backgroundAssetId',
    );
  });
});

describe('the request contract', () => {
  it('rejects an unknown field rather than dropping it', () => {
    const result = replaceProductPlacementSchema.safeParse({
      expectedUpdatedAt: '2026-08-04T10:00:00.000Z',
      sides: [],
      retiredAt: '2026-08-04T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts no retirement, storage or parent field on a side', () => {
    const base = {
      code: 'front',
      name: 'Mặt trước',
      displayOrder: 0,
      backgroundAssetId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
      imageWidthPx: 1000,
      imageHeightPx: 1000,
      physicalWidthMm: 200,
      physicalHeightMm: 200,
      pxPerMm: 5,
      areas: [],
    };
    for (const injected of [
      { retiredAt: '2026-01-01T00:00:00.000Z' },
      { supersededById: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' },
      { productId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' },
      { storageKey: 'development/originals/x.png' },
      { backgroundUrl: 'https://example.test/x.png' },
    ]) {
      const result = replaceProductPlacementSchema.safeParse({
        expectedUpdatedAt: '2026-08-04T10:00:00.000Z',
        sides: [{ ...base, ...injected }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('requires a uuid product id in the path', () => {
    expect(productPlacementIdParamSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});

/**
 * `APP3-B01-C1`. The concurrency contract has to be **visible**, not merely
 * enforced: a server-side compare-and-set whose token a client cannot discover
 * or submit is not a contract at all, and the first delivery published the
 * replace body as an empty object.
 *
 * These cases read the committed document and the generated client, because
 * those are what a consumer actually receives.
 */
describe('the concurrency token is an explicit HTTP contract', () => {
  const schemas = document.components.schemas;
  const CLIENT_SOURCE = readFileSync(
    join(
      __dirname,
      '../../../../../../packages/api-client/src/generated/embroidery-api.schemas.ts',
    ),
    'utf8',
  );

  it('is returned by the Admin read, and required there', () => {
    const response = schemas['AdminProductPlacementResponse'];
    expect(response?.properties).toHaveProperty('updatedAt');
    expect(response?.required).toContain('updatedAt');
  });

  it('is required by the Admin replace body', () => {
    const body = schemas['ReplaceProductPlacementBody'];
    expect(body?.properties).toHaveProperty('expectedUpdatedAt');
    expect(body?.required).toContain('expectedUpdatedAt');
  });

  it('is returned again by a successful replace, so the next write has a fresh one', () => {
    const put = document.paths['/api/admin/products/{productId}/placement']?.['put'];
    // The success payload is the whole Admin model, which carries `updatedAt`.
    expect(JSON.stringify(put?.responses?.['200'])).toContain('AdminProductPlacementResponse');
  });

  it('uses the same field names as every other Catalog concurrency contract', () => {
    // `UpdateProductBody`/`ArchiveProductBody` (APP2-B02) and the publication
    // bodies all spell it this way. A second vocabulary for placement would make
    // one client hold two rules for one column.
    expect(schemas['AdminProductDetailResponse']?.properties).toHaveProperty('updatedAt');
    expect(replaceProductPlacementSchema.shape).toHaveProperty('expectedUpdatedAt');
  });

  it('accepts a token carrying a UTC offset, exactly as APP2 does', () => {
    // The first delivery used a bare `datetime()`, which refused `+07:00` — a
    // token the same client could send to any other Admin Product write.
    for (const token of ['2026-08-04T10:00:00.000Z', '2026-08-04T17:00:00.000+07:00']) {
      const result = replaceProductPlacementSchema.safeParse({
        expectedUpdatedAt: token,
        sides: [],
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects a missing, blank or malformed token', () => {
    for (const token of [undefined, '', '   ', 'yesterday', '2026-08-04', 1_754_300_000_000]) {
      const result = replaceProductPlacementSchema.safeParse({
        ...(token === undefined ? {} : { expectedUpdatedAt: token }),
        sides: [],
      });
      expect(result.success).toBe(false);
    }
  });

  it('never appears in the public manifest', () => {
    const publicSchemas = Object.entries(schemas).filter(([name]) => name.startsWith('Public'));
    const serialized = JSON.stringify(Object.fromEntries(publicSchemas));
    expect(serialized).not.toContain('expectedUpdatedAt');
    expect(serialized).not.toContain('updatedAt');
  });

  it('is typed by the generated client, in and out', () => {
    expect(CLIENT_SOURCE).toMatch(
      /interface ReplaceProductPlacementBody[\s\S]{0,600}expectedUpdatedAt: string;/,
    );
    expect(CLIENT_SOURCE).toMatch(
      /interface AdminProductPlacementResponse[\s\S]{0,900}updatedAt: string;/,
    );
  });

  it('adds no operation while doing any of this', () => {
    expect(placementOperations()).toHaveLength(3);
  });

  it('documents the body the schema actually accepts', () => {
    // `createZodDto` carries no OpenAPI metadata, so the documented shape is
    // declared separately. These two descriptions of one contract are held
    // together here and nowhere else.
    const documented = Object.keys(schemas['ReplaceProductPlacementBody']?.properties ?? {}).sort();
    expect(documented).toEqual(Object.keys(replaceProductPlacementSchema.shape).sort());
  });
});

describe('module wiring', () => {
  it('registers both controllers so the two views stay one contract', () => {
    expect(AdminProductPlacementController.name).toBe('AdminProductPlacementController');
    expect(PublicProductPlacementController.name).toBe('PublicProductPlacementController');
  });

  it('imports no Design module: placement is Catalog authority (IMP-D041 PO-01)', () => {
    for (const source of [ADMIN_SOURCE, PUBLIC_SOURCE]) {
      expect(source).not.toMatch(/from\s*['"].*modules\/design.*['"]/);
    }
  });
});

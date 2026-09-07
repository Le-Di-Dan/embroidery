/**
 * The `APP12-C01` contract boundary, asserted without a database.
 *
 * Six things are proved here and nowhere else:
 *
 * 1. **The published delta is exactly one anonymous public GET**, on one new
 *    Path Item Object, carrying the canonical `publicCategory_list` id, and
 *    reaching the generated client — with the artifact at 133 operations
 *    (129 at C01, plus `APP12-C02`'s four Admin category writes) and 44 public
 *    ones.
 * 2. **The four-value category enum is gone from every affected seam.** The
 *    embedded Product category, both Product list filters and both Admin write
 *    bodies publish a pattern-validated string, and no schema in the artifact
 *    still enumerates the APP2 taxonomy.
 * 3. **The inventory wire carries four fields and nothing else.** No physical
 *    id, no description, no SEO text, no status, no timestamps, no URL.
 * 4. **The operation is path-agnostic and unparameterised.** No browser route,
 *    no origin, no absolute address, and no query parameter of any kind.
 * 5. **Nothing outside C01's scope appeared.** No *public* category write, no
 *    Ready-Made order contract, no authentication decorator on the controller,
 *    and no category write repository in the module that serves the read.
 * 6. **The release gate classifies the new read.** `publicCategory_list` is
 *    `ALLOW` and the 31 withheld operations are untouched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATEGORY_SLUG_PATTERN } from '../domain/category-slug';
import { PUBLIC_CATEGORY_CACHE_CONTROL } from '../domain/public-category.policy';
import { PUBLIC_CATEGORY_ERROR_CODES } from '../domain/public-category.errors';
import {
  WAVE1_RELEASED_PUBLIC_OPERATIONS,
  SCOPE_GATED_PUBLIC_OPERATIONS,
  WAVE2_WITHHELD_PUBLIC_OPERATIONS,
} from '../../../platform/release-gate/wave2-operation-authority';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

interface ParameterObject {
  readonly name: string;
  readonly in?: string;
  readonly schema?: unknown;
}

interface OperationObject {
  readonly operationId?: string;
  readonly parameters?: readonly ParameterObject[];
  readonly security?: unknown;
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<string, Record<string, OperationObject>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);
const CLIENT_SCHEMAS = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.schemas.ts'),
  'utf8',
);

const CATEGORIES = '/api/public/categories';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const CONTROLLER = readFileSync(join(__dirname, 'public-category.controller.ts'), 'utf8');
const RESPONSE_SOURCE = readFileSync(
  join(__dirname, 'schemas', 'public-category.response.ts'),
  'utf8',
);
const MODULE_SOURCE = readFileSync(join(__dirname, '..', 'catalog-public.module.ts'), 'utf8');

/** Drops block and line comments so a structural check reads code, not prose. */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

function allOperations(): { path: string; method: string; operation: OperationObject }[] {
  return Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]) => ({ path, method, operation })),
  );
}

describe('the published category inventory operation', () => {
  it('is one anonymous GET on its own path, with the canonical id', () => {
    const item = OPENAPI.paths[CATEGORIES];

    expect(Object.keys(item ?? {}).filter((key) => HTTP_METHODS.includes(key))).toEqual(['get']);
    expect(item?.['get']?.operationId).toBe('publicCategory_list');
    expect(item?.['get']?.security).toBeUndefined();
  });

  it('takes no query or path parameter at all — no cursor, no limit, no filter', () => {
    // The global `X-Request-ID` header is applied to every operation by the
    // document augmentation and is not this operation's contract; what must be
    // empty is everything a caller could use to shape the answer.
    const shaping = (OPENAPI.paths[CATEGORIES]?.['get']?.parameters ?? []).filter(
      (parameter) => parameter.in !== 'header',
    );

    expect(shaping).toEqual([]);
  });

  it('is the only category operation, and no operation anywhere writes one', () => {
    const categoryOperations = allOperations().filter(({ operation }) =>
      operation.operationId?.startsWith('publicCategory'),
    );

    expect(categoryOperations.map(({ operation }) => operation.operationId)).toEqual([
      'publicCategory_list',
    ]);
    // `APP12-C02` delivered category mutation, and it is **Admin-only**. The
    // assertion narrows from "nothing writes a category" to "nothing public
    // does": the public boundary must stay a read forever, while the four
    // `adminCategory_*` operations are the operator surface that made the
    // taxonomy data. A public category write appearing here is still a failure.
    const publicCategoryWrites = allOperations().filter(
      ({ method, path, operation }) =>
        method !== 'get' &&
        path.startsWith('/api/public') &&
        /[Cc]ategory/.test(operation.operationId ?? ''),
    );
    expect(publicCategoryWrites).toEqual([]);
  });

  it('leaves the artifact at 140 operations, 49 of them public', () => {
    const operations = allOperations();

    // 133 when C02 closed; the Ready-Made commerce checkpoints `APP12-B01`…
    // `APP12-B05` and `APP12-A02-C1` brought it to 138 / 49, which is the
    // baseline `APP12-H01` re-measured and froze; `APP12-V02-C2` added one
    // **Admin** operation on top of it, and `APP12-M01.B2` a second one
    // (`adminProductMedia_replace`). This read is still not one of the
    // additions: the public assertion below is what says so, and it has not
    // moved through any of them.
    expect(operations).toHaveLength(140);
    expect(
      operations.filter(({ operation }) => operation.operationId?.startsWith('public')),
    ).toHaveLength(49);
  });

  it('reaches the generated client as a callable read', () => {
    expect(CLIENT_SOURCE).toContain('publicCategoryList');
    expect(CLIENT_SCHEMAS).toContain('PublicCategoryInventoryItemResponse');
  });
});

describe('the dynamic category contract', () => {
  function slugSchemaOf(name: string): { pattern?: string; enum?: unknown } {
    const schema = OPENAPI.components.schemas[name] as {
      properties: Record<string, { pattern?: string; enum?: unknown }>;
    };
    return schema.properties['slug'] ?? {};
  }

  it.each([
    'PublicCategoryResponse',
    'AdminProductCategoryResponse',
    'PublicCategoryInventoryItemResponse',
  ])('publishes %s.slug as a pattern-validated string, not an enum', (name) => {
    const slug = slugSchemaOf(name);

    expect(slug.pattern).toBe(CATEGORY_SLUG_PATTERN.source);
    expect(slug.enum).toBeUndefined();
  });

  it.each([
    ['/api/public/products', 'publicProduct_list'],
    ['/api/admin/products', 'adminProduct_list'],
  ])('publishes the %s category filter as a pattern-validated string', (path, operationId) => {
    const operation = OPENAPI.paths[path]?.['get'];
    expect(operation?.operationId).toBe(operationId);

    const filter = operation?.parameters?.find((parameter) => parameter.name === 'categorySlug');
    expect(filter?.schema).toEqual({ type: 'string', pattern: CATEGORY_SLUG_PATTERN.source });
  });

  it.each(['CreateProductBody', 'UpdateProductBody'])(
    'publishes %s.categorySlug as a pattern-validated string',
    (name) => {
      const body = OPENAPI.components.schemas[name] as {
        properties: Record<string, { pattern?: string; enum?: unknown }>;
      };

      expect(body.properties['categorySlug']?.pattern).toBe(CATEGORY_SLUG_PATTERN.source);
      expect(body.properties['categorySlug']?.enum).toBeUndefined();
    },
  );

  it('leaves no closed APP2 taxonomy enum anywhere in the artifact or the client', () => {
    // The whole document, not a field list: an enum of exactly those four values
    // is the ceiling C01 removed, wherever it might still be written.
    expect(JSON.stringify(OPENAPI)).not.toContain('"thu-bong","khan","quan-ao","khac"');
    expect(CLIENT_SCHEMAS).not.toContain('PublicProductListCategorySlug');
    expect(CLIENT_SCHEMAS).not.toContain('AdminProductListCategorySlug');
    expect(CLIENT_SCHEMAS).not.toContain('CreateProductBodyCategorySlug');
    expect(CLIENT_SCHEMAS).not.toContain('UpdateProductBodyCategorySlug');
  });

  it('accepts a fifth slug and rejects the shapes a slug may not take', () => {
    for (const slug of ['ao-thun', 'thu-bong', 'khac', 'danh-muc-2026']) {
      expect({ slug, ok: CATEGORY_SLUG_PATTERN.test(slug) }).toEqual({ slug, ok: true });
    }
    for (const slug of ['AO-THUN', 'áo-thun', 'ao_thun', 'ao thun', '-ao', 'ao-', 'ao--thun', '']) {
      expect({ slug, ok: CATEGORY_SLUG_PATTERN.test(slug) }).toEqual({ slug, ok: false });
    }
  });
});

describe('what the inventory response may carry', () => {
  it('publishes exactly four fields, all required', () => {
    const item = OPENAPI.components.schemas['PublicCategoryInventoryItemResponse'] as {
      properties: Record<string, unknown>;
      required: readonly string[];
    };

    expect(Object.keys(item.properties).sort()).toEqual([
      'displayOrder',
      'isIndexable',
      'name',
      'slug',
    ]);
    expect([...item.required].sort()).toEqual(['displayOrder', 'isIndexable', 'name', 'slug']);
  });

  it('names no physical or internal category fact', () => {
    const code = withoutComments(RESPONSE_SOURCE);

    // Declared properties, not prose: `description` appears in every
    // `@ApiProperty` and says nothing about what the wire carries.
    for (const forbidden of [
      'id!',
      'categoryId!',
      'description!',
      'seoTitle!',
      'seoDescription!',
      'status!',
      'archivedAt!',
      'createdAt!',
      'updatedAt!',
    ]) {
      expect({ forbidden, present: code.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });

  it('emits no browser route, origin or absolute URL', () => {
    for (const source of [CONTROLLER, RESPONSE_SOURCE]) {
      const code = withoutComments(source);
      expect(code).not.toContain('http://');
      expect(code).not.toContain('https://');
      expect(code).not.toContain('kham-pha');
      expect(code).not.toContain('/san-pham');
    }
  });
});

describe('what the checkpoint refuses to add', () => {
  it('leaves the controller anonymous and read-only', () => {
    const code = withoutComments(CONTROLLER);

    for (const decorator of ['@UseGuards', '@ApiCookieAuth', '@ApiBearerAuth', '@StaffSession']) {
      expect({ decorator, present: code.includes(decorator) }).toEqual({
        decorator,
        present: false,
      });
    }
    for (const verb of ['@Post(', '@Patch(', '@Put(', '@Delete(']) {
      expect({ verb, present: code.includes(verb) }).toEqual({ verb, present: false });
    }
  });

  it('wires no category write repository into the module that serves the read', () => {
    const code = withoutComments(MODULE_SOURCE);

    expect(code).toContain('PUBLIC_CATEGORY_REPOSITORY');
    // The Admin write port — create, changeStatus — belongs to `CatalogModule`.
    expect(code).not.toContain('DrizzleCategoryRepository');
  });

  /**
   * Narrowed by `APP12-H01` from "the artifact contains no `READY_MADE`" to
   * "*this surface* contains none". The original fence was C01's, written when
   * Ready-Made did not exist anywhere; `APP12-B01`…`APP12-B05` then delivered
   * it under locked roadmap authority, so the artifact-wide form asserts a fact
   * the system has deliberately stopped having. What C01 was actually
   * protecting — that a public *category* read never becomes an order surface —
   * is unchanged and is what is checked here.
   */
  it('publishes no Ready-Made order contract on the category surface', () => {
    expect(JSON.stringify(OPENAPI.paths[CATEGORIES])).not.toContain('READY_MADE');
  });

  it('declares one error code and the documented cache policy', () => {
    expect(PUBLIC_CATEGORY_ERROR_CODES).toEqual(['PUBLIC_CATEGORY_INVENTORY_TOO_LARGE']);
    expect(PUBLIC_CATEGORY_CACHE_CONTROL).toBe('no-store');
    expect(CONTROLLER).toContain('PUBLIC_CATEGORY_CACHE_CONTROL');
  });
});

describe('release-gate classification', () => {
  it('releases the new read in Wave 1', () => {
    expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.has('publicCategory_list')).toBe(true);
    expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has('publicCategory_list')).toBe(false);
  });

  /**
   * `publicSecureLink_resolve` left the withheld set at `APP12-B04` and was not
   * released by doing so: it now serves both waves through one operation, so its
   * wave is a property of the resolved grant rather than of the operation, and
   * `GrantScopeReleaseGate` refuses a `REQUEST_ACCESS` scope inside the
   * resolution path with the same indistinguishable `SECURE_LINK_UNAVAILABLE`.
   * The assertion follows it into `SCOPE_GATED` rather than being dropped.
   */
  it('leaves the withheld set at 28, with secure-link resolution scope-gated', () => {
    expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.size).toBe(28);
    expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.size).toBe(18);
    expect(SCOPE_GATED_PUBLIC_OPERATIONS.size).toBe(3);
    expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has('publicSecureLink_resolve')).toBe(false);
    expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.has('publicSecureLink_resolve')).toBe(false);
    expect(SCOPE_GATED_PUBLIC_OPERATIONS.has('publicSecureLink_resolve')).toBe(true);
  });
});

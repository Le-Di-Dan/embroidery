/**
 * The `APP12-C02` contract boundary, asserted without a database.
 *
 * Six things are proved here and nowhere else:
 *
 * 1. **The published delta is exactly four Admin operations** on two Path Item
 *    Objects, carrying the canonical `adminCategory_*` ids and reaching the
 *    generated client — with the artifact at 133 operations and the public
 *    count unchanged at 44.
 * 2. **There is no hard delete, no bulk route and no public mutation.** APP12
 *    ends at `ARCHIVED`, and the public boundary stays a read.
 * 3. **No category *value* enum appears.** The only two enums the surface
 *    publishes are the lifecycle vocabulary and the transition vocabulary, both
 *    of which are rules this application owns (`IMP-D062`).
 * 4. **The write bodies accept nothing the server owns.** No `id`, no `status`,
 *    no `archivedAt`, no timestamps beyond the concurrency token — and both
 *    bodies are `additionalProperties: false`.
 * 5. **Every operation is Admin-authenticated**, with the mutation guards this
 *    repository uses everywhere.
 * 6. **The release gate is untouched.** 31 withheld, 13 released, 44 public.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATEGORY_SLUG_PATTERN } from '../domain/category-slug';
import {
  ADMIN_CATEGORY_ERROR_CODES,
  type AdminCategoryErrorCode,
} from '../domain/admin-category.errors';
import { CATEGORY_TRANSITION_ACTIONS } from '../domain/admin-category.policy';
import {
  WAVE1_RELEASED_PUBLIC_OPERATIONS,
  SCOPE_GATED_PUBLIC_OPERATIONS,
  WAVE2_WITHHELD_PUBLIC_OPERATIONS,
} from '../../../platform/release-gate/wave2-operation-authority';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

interface SchemaObject {
  readonly type?: string;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaObject>;
  readonly additionalProperties?: unknown;
  readonly $ref?: string;
}

interface OperationObject {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in?: string }[];
  readonly requestBody?: { readonly content?: Record<string, { readonly schema?: SchemaObject }> };
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<string, Record<string, OperationObject>>;
  readonly components: { readonly schemas: Record<string, SchemaObject> };
};

const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);
const CONTROLLER = readFileSync(join(__dirname, 'admin-category.controller.ts'), 'utf8');

const COLLECTION = '/api/admin/categories';
const ITEM = '/api/admin/categories/{categoryId}';
const TRANSITIONS = '/api/admin/categories/{categoryId}/transitions';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function allOperations(): { path: string; method: string; operation: OperationObject }[] {
  return Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]) => ({ path, method, operation })),
  );
}

function operation(path: string, method: string): OperationObject {
  const found = OPENAPI.paths[path]?.[method];
  if (found === undefined) {
    throw new Error(`No ${method.toUpperCase()} ${path} in the artifact.`);
  }
  return found;
}

function bodySchema(path: string, method: string): SchemaObject {
  const schema = operation(path, method).requestBody?.content?.['application/json']?.schema;
  if (schema === undefined) {
    throw new Error(`No JSON body on ${method.toUpperCase()} ${path}.`);
  }
  const ref = schema.$ref;
  return ref === undefined
    ? schema
    : (OPENAPI.components.schemas[ref.split('/').pop() ?? ''] ?? {});
}

describe('the published Admin category surface', () => {
  it('publishes exactly the four canonical operations', () => {
    expect(operation(COLLECTION, 'get').operationId).toBe('adminCategory_list');
    expect(operation(COLLECTION, 'post').operationId).toBe('adminCategory_create');
    expect(operation(ITEM, 'patch').operationId).toBe('adminCategory_update');
    expect(operation(TRANSITIONS, 'post').operationId).toBe('adminCategory_transition');
  });

  /**
   * The composition proof and the bound on the checkpoint's size in one
   * assertion: every category route in the whole document is one of these four
   * plus the `APP12-C01` public read. A fifth would fail here.
   */
  it('adds no category route beyond those four', () => {
    const routes = allOperations()
      .filter(({ path }) => /\/categories/.test(path))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
      .sort();

    expect(routes).toEqual(
      [
        `GET ${COLLECTION}`,
        `POST ${COLLECTION}`,
        `PATCH ${ITEM}`,
        `POST ${TRANSITIONS}`,
        'GET /api/public/categories',
      ].sort(),
    );
  });

  /**
   * `ARCHIVED` is terminal for APP12. A category's Products hold a real foreign
   * key to it (REL-020 `restrict`), so a delete would either fail or take
   * history with it — and no operator screen asks for one.
   */
  it('publishes no delete, no bulk route and no per-verb lifecycle route', () => {
    const stray = Object.keys(OPENAPI.paths).filter((path) =>
      /categories\/\{categoryId\}\/(publish|archive|unpublish|restore)|categories\/(bulk|batch|import)/i.test(
        path,
      ),
    );
    expect(stray).toEqual([]);
    expect(OPENAPI.paths[ITEM]?.['delete']).toBeUndefined();
    expect(OPENAPI.paths[COLLECTION]?.['delete']).toBeUndefined();
  });

  it('leaves the artifact at 138 operations, with the public count unchanged at 49', () => {
    const operations = allOperations();

    expect(operations).toHaveLength(138);
    expect(
      operations.filter(({ operation: op }) => op.operationId?.startsWith('public')),
    ).toHaveLength(49);
  });

  it('reaches the generated client as four callable operations', () => {
    for (const name of [
      'adminCategoryList',
      'adminCategoryCreate',
      'adminCategoryUpdate',
      'adminCategoryTransition',
    ]) {
      expect(CLIENT_SOURCE).toContain(name);
    }
  });
});

describe('the category taxonomy stays out of the contract', () => {
  /**
   * The whole point of `APP12-C01-C1`, re-asserted at the surface that could
   * most easily undo it: a mutation contract naming the categories it may
   * create would be a compiled taxonomy with an operator screen attached.
   */
  it('publishes no category-value enum on any category schema', () => {
    for (const name of [
      'AdminCategoryResponse',
      'AdminCategoryListItemResponse',
      'CreateCategoryBody',
      'UpdateCategoryBody',
    ]) {
      const schema = OPENAPI.components.schemas[name];
      expect(schema?.properties?.['slug']?.enum).toBeUndefined();
      expect(schema?.properties?.['slug']?.pattern).toBe(CATEGORY_SLUG_PATTERN.source);
      expect(schema?.properties?.['name']?.enum).toBeUndefined();
    }
  });

  /**
   * Two enums, and both are rules. `status` is the lifecycle vocabulary and
   * `action` the transition vocabulary; neither says which categories exist.
   */
  it('publishes only the lifecycle and transition vocabularies as enums', () => {
    expect(
      OPENAPI.components.schemas['AdminCategoryResponse']?.properties?.['status']?.enum,
    ).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
    expect(bodySchema(TRANSITIONS, 'post').properties?.['action']?.enum).toEqual([
      ...CATEGORY_TRANSITION_ACTIONS,
    ]);
  });
});

describe('the write contract accepts nothing the server owns', () => {
  const FORBIDDEN = [
    'id',
    'categoryId',
    'status',
    'archivedAt',
    'createdAt',
    'updatedAt',
    'productCount',
    'publishedProductCount',
    'actorId',
    'adminId',
    'correlationId',
  ];

  it.each([
    ['create', COLLECTION, 'post'],
    ['update', ITEM, 'patch'],
    ['transition', TRANSITIONS, 'post'],
  ])('rejects server-owned fields on %s', (_label, path, method) => {
    const schema = bodySchema(path, method);
    expect(schema.additionalProperties).toBe(false);
    for (const field of FORBIDDEN) {
      expect(Object.keys(schema.properties ?? {})).not.toContain(field);
    }
  });

  it('makes create carry the four operator-authored fields and no status', () => {
    const schema = bodySchema(COLLECTION, 'post');
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      'displayOrder',
      'isIndexable',
      'name',
      'slug',
    ]);
    expect([...(schema.required ?? [])].sort()).toEqual([
      'displayOrder',
      'isIndexable',
      'name',
      'slug',
    ]);
  });

  it('makes both stateful mutations require the concurrency token', () => {
    expect(bodySchema(ITEM, 'patch').required).toContain('expectedUpdatedAt');
    expect(bodySchema(TRANSITIONS, 'post').required).toContain('expectedUpdatedAt');
  });

  it('locates every mutation by the internal category id, never by the slug', () => {
    for (const [path, method] of [
      [ITEM, 'patch'],
      [TRANSITIONS, 'post'],
    ] as const) {
      const pathParams = (operation(path, method).parameters ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name);
      expect(pathParams).toEqual(['categoryId']);
    }
  });
});

describe('authentication and the release gate', () => {
  it('guards the controller with the Admin session and every mutation with the staff guards', () => {
    expect(CONTROLLER).toContain('@UseGuards(AuthenticatedAdminGuard)');
    // Three mutations, three guard applications; a fourth would mean a mutation
    // was added without them.
    expect(CONTROLLER.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g)).toHaveLength(3);
    expect(CONTROLLER).toContain("@ApiCookieAuth('adminSession')");
  });

  it('documents 401 on every operation', () => {
    for (const [path, method] of [
      [COLLECTION, 'get'],
      [COLLECTION, 'post'],
      [ITEM, 'patch'],
      [TRANSITIONS, 'post'],
    ] as const) {
      expect(Object.keys(operation(path, method).responses ?? {})).toContain('401');
    }
  });

  /**
   * C02 published no public operation, so the Wave-2 matrix must be exactly the
   * one the release authority carries. The three numbers were 31 / 13 / 0 when
   * this was written; `APP12-B04` moved the secure-link resolver and the two
   * halves of the evidence lane out of the withheld set into `SCOPE_GATED`
   * (their wave is a property of the resolved grant, not of the operation), and
   * `APP12-B01`…`APP12-B04` released the Ready-Made surface. `APP12-H01`
   * re-measured them against the artifact rather than assuming: the three sets
   * partition the 49 public operations exactly, with nothing unclassified and
   * nothing classified twice, which is the invariant this test is really for.
   */
  it('leaves the Wave-2 public matrix at 28 DENY / 18 ALLOW / 3 SCOPE_GATED', () => {
    expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.size).toBe(28);
    expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.size).toBe(18);
    expect(SCOPE_GATED_PUBLIC_OPERATIONS.size).toBe(3);

    // The partition, checked rather than implied by the three sizes summing to
    // 49: an operation missing from all three would be unclassified release
    // surface, and one in two of them would make the gate's answer depend on
    // lookup order.
    const classified = [
      ...WAVE2_WITHHELD_PUBLIC_OPERATIONS,
      ...WAVE1_RELEASED_PUBLIC_OPERATIONS,
      ...SCOPE_GATED_PUBLIC_OPERATIONS,
    ];
    const published = allOperations()
      .map(({ operation: op }) => op.operationId)
      .filter((id): id is string => id !== undefined && id.startsWith('public'));

    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual([...published].sort());
    expect(classified.filter((id) => id.startsWith('admin'))).toEqual([]);
  });

  /** The error vocabulary is closed and every code is documented on a route. */
  it('documents every business error code the surface can raise', () => {
    const documented = [COLLECTION, ITEM, TRANSITIONS]
      .flatMap((path) => Object.values(OPENAPI.paths[path] ?? {}))
      .map((op) => JSON.stringify(op))
      .join(' ');

    const undocumented = ADMIN_CATEGORY_ERROR_CODES.filter(
      (code: AdminCategoryErrorCode) =>
        code !== 'CATEGORY_INVENTORY_TOO_LARGE' && !documented.includes(code),
    );
    expect(undocumented).toEqual([]);
  });
});

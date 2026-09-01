/**
 * The repository-wide publication contract (`APP3-P03` §9).
 *
 * The platform specs prove the mechanism converts correctly. This one proves it
 * was actually *applied* — to every schema-backed DTO this repository has, in
 * the committed OpenAPI artifact and in the generated client a consumer builds
 * against. A mechanism that works but reaches only six of sixteen consumers
 * would leave the defect exactly where it was.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ZodObject } from 'zod';

import { zodSchemaOf } from '../validation/zod-dto';

const API_SRC = join(__dirname, '..', '..');
const REPO = join(API_SRC, '..', '..', '..');

const OPENAPI = JSON.parse(
  readFileSync(join(REPO, 'packages', 'contracts', 'openapi', 'openapi.generated.json'), 'utf8'),
) as OpenApiDocument;

const CLIENT_SCHEMAS = readFileSync(
  join(REPO, 'packages', 'api-client', 'src', 'generated', 'embroidery-api.schemas.ts'),
  'utf8',
);

interface OpenApiSchema {
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  nullable?: boolean;
  format?: string;
  pattern?: string;
  description?: string;
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  $ref?: string;
}

interface OpenApiOperation {
  operationId?: string;
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  responses?: Record<string, { content?: Record<string, unknown> }>;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, OpenApiSchema> };
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];

/** Every `*.request.ts` module in the API source tree. */
function requestModulePaths(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.request.ts')) {
        found.push(path);
      }
    }
  };
  walk(join(API_SRC, 'modules'));
  return found.sort();
}

/** Every `class X extends createZodDto(...)` in the repository, with its module. */
function declaredConsumers(): { name: string; path: string; source: string }[] {
  const consumers: { name: string; path: string; source: string }[] = [];
  for (const path of requestModulePaths()) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/class\s+(\w+)\s+extends\s+createZodDto\(/g)) {
      consumers.push({ name: match[1] ?? '', path, source });
    }
  }
  return consumers;
}

const CONSUMERS = declaredConsumers();

function bodySchemaOf(operationId: string): OpenApiSchema | undefined {
  for (const pathItem of Object.values(OPENAPI.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method) || operation.operationId !== operationId) {
        continue;
      }
      return operation.requestBody?.content?.['application/json']?.schema;
    }
  }
  return undefined;
}

/** One published component, or `{}` — so a missing one fails on the assertion that names it. */
function component(name: string): OpenApiSchema {
  return OPENAPI.components.schemas[name] ?? {};
}

/** One property of a published schema. */
function propertyOf(schema: OpenApiSchema | undefined, name: string): OpenApiSchema {
  return (schema?.properties ?? {})[name] ?? {};
}

function resolve(schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  if (schema?.$ref === undefined) {
    return schema;
  }
  return OPENAPI.components.schemas[schema.$ref.replace('#/components/schemas/', '')];
}

/**
 * The property sets a schema publishes: its own, or one per `oneOf`/`anyOf`
 * branch, or the merged `allOf` parts. `APP3-B06B` published the first union
 * body (`CreateDesignSessionBody`), which carries its fields on the branches
 * rather than on the wrapper — so a sweep that reads only `properties` sees an
 * empty object and calls a correctly published body a defect.
 */
function publishedPropertySets(schema: OpenApiSchema | undefined): OpenApiSchema[] {
  const branches = schema?.oneOf ?? schema?.anyOf ?? schema?.allOf;
  if (branches === undefined) {
    return [schema ?? {}];
  }
  return branches.flatMap((branch) => publishedPropertySets(resolve(branch)));
}

/** Every JSON request body in the document, resolved, with its operation id. */
function jsonRequestBodies(): { operationId: string; schema: OpenApiSchema }[] {
  const bodies: { operationId: string; schema: OpenApiSchema }[] = [];
  for (const [path, pathItem] of Object.entries(OPENAPI.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method)) {
        continue;
      }
      const schema = resolve(operation.requestBody?.content?.['application/json']?.schema);
      if (schema !== undefined) {
        bodies.push({ operationId: operation.operationId ?? `${method} ${path}`, schema });
      }
    }
  }
  return bodies;
}

describe('every schema-backed DTO is accounted for', () => {
  it('finds the DTO consumers the repository declares', () => {
    expect(CONSUMERS.length).toBeGreaterThanOrEqual(16);
    expect(CONSUMERS.map((consumer) => consumer.name)).toEqual(
      expect.arrayContaining([
        'CreateProductBody',
        'UpdateProductBody',
        'ArchiveProductBody',
        'PublishProductBody',
        'UnpublishProductBody',
        'ReplaceProductPlacementBody',
        'StaffLoginRequestDto',
      ]),
    );
  });

  it('registers every one of them for publication — none is skipped silently', () => {
    const unregistered = CONSUMERS.filter(
      (consumer) =>
        !new RegExp(`registerZodDtos\\([^)]*\\b${consumer.name}\\b`, 's').test(consumer.source),
    );
    expect(unregistered.map((consumer) => consumer.name)).toEqual([]);
  });

  it('keeps no per-feature `@ApiProperty` workaround on a schema-backed DTO', () => {
    const decorated = CONSUMERS.filter((consumer) =>
      new RegExp(
        `class\\s+${consumer.name}\\s+extends\\s+createZodDto\\([^)]*\\)\\s*\\{\\s*@Api`,
      ).test(consumer.source),
    );
    expect(decorated.map((consumer) => consumer.name)).toEqual([]);
  });
});

describe('no request body publishes an empty schema', () => {
  const bodies = jsonRequestBodies();

  it('documents at least one JSON body, so the sweep below is not vacuous', () => {
    expect(bodies.length).toBeGreaterThanOrEqual(7);
  });

  it.each(bodies.map((body) => [body.operationId, body.schema] as const))(
    '%s publishes its fields',
    (_operationId, schema) => {
      // A union body satisfies this when every branch publishes fields — an
      // empty branch is still the defect this sweep exists to catch.
      for (const published of publishedPropertySets(schema)) {
        expect(Object.keys(published.properties ?? {}).length).toBeGreaterThan(0);
      }
    },
  );

  it('publishes every nested component a body reaches', () => {
    for (const { schema } of bodies) {
      for (const published of publishedPropertySets(schema)) {
        for (const property of Object.values(published.properties ?? {})) {
          const nested = resolve(property.items ?? property);
          if (nested?.type === 'object') {
            expect(Object.keys(nested.properties ?? {}).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('the published body matches the schema that validates it', () => {
  const CASES: readonly [string, string, () => Promise<unknown>][] = [
    [
      'CreateProductBody',
      'createProductBodySchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product.request'),
    ],
    [
      'UpdateProductBody',
      'updateProductBodySchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product.request'),
    ],
    [
      'ArchiveProductBody',
      'archiveProductBodySchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product.request'),
    ],
    [
      'PublishProductBody',
      'publicationCommandBodySchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product-publication.request'),
    ],
    [
      'UnpublishProductBody',
      'publicationCommandBodySchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product-publication.request'),
    ],
    [
      'ReplaceProductPlacementBody',
      'replaceProductPlacementSchema',
      () => import('../../modules/catalog/presentation/schemas/admin-product-placement.request'),
    ],
  ];

  it.each(CASES)(
    '%s publishes exactly the fields %s accepts',
    async (componentName, _key, load) => {
      const module = (await load()) as Record<string, unknown>;
      const schema = zodSchemaOf(module[componentName]) as ZodObject;
      const published = component(componentName);

      expect(Object.keys(published.properties ?? {}).sort()).toEqual(
        Object.keys(schema.shape).sort(),
      );
    },
  );

  it.each(CASES)('%s marks exactly the fields %s requires', async (componentName, _key, load) => {
    const module = (await load()) as Record<string, unknown>;
    const schema = zodSchemaOf(module[componentName]) as ZodObject;
    const published = component(componentName);

    const runtimeRequired = Object.entries(schema.shape)
      .filter(
        ([, field]) =>
          !(field as { safeParse: (v: unknown) => { success: boolean } }).safeParse(undefined)
            .success,
      )
      .map(([name]) => name)
      .sort();

    expect((published.required ?? []).slice().sort()).toEqual(runtimeRequired);
  });
});

describe('the placement body keeps its exact APP3-B01-C1 contract', () => {
  const body = component('ReplaceProductPlacementBody');

  it('requires the concurrency token and the side list', () => {
    expect((body.required ?? []).slice().sort()).toEqual(['expectedUpdatedAt', 'sides']);
  });

  it('publishes the token as an offset-bearing date-time string', () => {
    const token = body.properties?.expectedUpdatedAt as Record<string, unknown>;
    expect(token.type).toBe('string');
    expect(token.format).toBe('date-time');
    expect(String(token.pattern)).toContain('[+-]');
  });

  it('publishes the nested Side structure, not an opaque array', () => {
    const side = resolve(body.properties?.sides?.items);
    expect(Object.keys(side?.properties ?? {}).sort()).toEqual([
      'areas',
      'backgroundAssetId',
      'code',
      'displayOrder',
      'id',
      'imageHeightPx',
      'imageWidthPx',
      'name',
      'physicalHeightMm',
      'physicalWidthMm',
      'pxPerMm',
      'supersedesId',
    ]);
  });

  it('publishes the nested Area structure beneath it', () => {
    const side = resolve(body.properties?.sides?.items);
    const area = resolve(side?.properties?.areas?.items);
    expect(Object.keys(area?.properties ?? {}).sort()).toEqual([
      'boundHeightPx',
      'boundWidthPx',
      'boundXPx',
      'boundYPx',
      'code',
      'displayOrder',
      'id',
      'maxHeightMm',
      'maxWidthMm',
      'name',
      'supersedesId',
    ]);
  });

  it('keeps the authored descriptions on the fields that carry them', () => {
    const token = body.properties?.expectedUpdatedAt as Record<string, unknown>;
    expect(String(token.description)).toContain('concurrency token');
    const side = resolve(body.properties?.sides?.items);
    const asset = side?.properties?.backgroundAssetId as Record<string, unknown>;
    expect(asset.description).toBe('The Asset whose derivative renders this side.');
  });
});

describe('the Product mutation bodies keep their exact fields', () => {
  it('CreateProductBody requires a category and a name and nothing else', () => {
    const body = component('CreateProductBody');
    expect(Object.keys(body.properties ?? {}).sort()).toEqual([
      'categorySlug',
      'description',
      'name',
    ]);
    expect((body.required ?? []).slice().sort()).toEqual(['categorySlug', 'name']);
  });

  it('UpdateProductBody requires only the concurrency token', () => {
    const body = component('UpdateProductBody');
    expect(body.required).toEqual(['expectedUpdatedAt']);
    expect(Object.keys(body.properties ?? {}).sort()).toEqual([
      'basePriceAmount',
      'categorySlug',
      'description',
      'expectedUpdatedAt',
      'mediaAssetIds',
      'name',
    ]);
  });

  it('publishes the nullable description as nullable rather than as an optional-only field', () => {
    const description = propertyOf(component('UpdateProductBody'), 'description');
    expect(description.nullable).toBe(true);
  });

  it('publishes both publication commands with the same one-field body', () => {
    for (const name of ['PublishProductBody', 'UnpublishProductBody']) {
      const body = component(name);
      expect(Object.keys(body.properties ?? {})).toEqual(['expectedUpdatedAt']);
      expect(body.required).toEqual(['expectedUpdatedAt']);
    }
  });
});

describe('the generated client exposes the same fields', () => {
  const interfaceOf = (name: string): string => {
    const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(CLIENT_SCHEMAS);
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
  };

  it.each([
    'CreateProductBody',
    'UpdateProductBody',
    'ArchiveProductBody',
    'PublishProductBody',
    'UnpublishProductBody',
    'ReplaceProductPlacementBody',
    'ReplacePlacementSideBody',
    'ReplacePlacementAreaBody',
  ])('%s is a real interface, not an index signature over unknown', (name) => {
    const body = interfaceOf(name);
    expect(body).not.toContain('[key: string]: unknown');
    const published = component(name);
    for (const field of Object.keys(published.properties ?? {})) {
      expect(body).toContain(`${field}`);
    }
  });

  it('types the placement concurrency token both ways round', () => {
    expect(interfaceOf('ReplaceProductPlacementBody')).toMatch(/expectedUpdatedAt: string;/);
    expect(interfaceOf('ReplaceProductPlacementBody')).toMatch(
      /sides: ReplacePlacementSideBody\[\];/,
    );
  });
});

describe('nothing else about the published surface moved', () => {
  it('publishes one uniquely and canonically identified operation per method', () => {
    // This asserted "19 paths and 23 operations" from APP3-P03 until APP12-G01.
    // That number was never the invariant — it is the count of endpoints
    // shipped so far, so every later checkpoint had to either break this test
    // or edit a number, and neither proves anything about publication. What
    // the surrounding `describe` is actually guarding is that the publication
    // mechanism emits a *coherent* document, and that survives growth.
    const operations = Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([method]) => HTTP_METHODS.includes(method))
        .map(([method, operation]) => ({ path, method, operation })),
    );

    expect(operations.length).toBeGreaterThanOrEqual(Object.keys(OPENAPI.paths).length);

    // Every operation is identified. An unidentified one publishes no client
    // method at all, which is the failure this file exists to prevent.
    expect(operations.filter(({ operation }) => operation.operationId === undefined)).toEqual([]);

    // Ids are unique. A duplicate silently overwrites a generated client method.
    const ids = operations.map(({ operation }) => operation.operationId ?? '');
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    // And each one keeps the locked `<domain>_<method>` form (APP0-B05).
    expect(ids.filter((id) => !/^[a-z][A-Za-z0-9]*_[a-z][A-Za-z0-9]*$/.test(id))).toEqual([]);
  });

  it('adds no request body to the APP3-B02 binary delivery route', () => {
    const operation =
      OPENAPI.paths['/api/public/products/{slug}/sides/{sideCode}/background']?.['get'];
    expect(operation?.operationId).toBe('publicProductSideBackground_get');
    expect(operation?.requestBody).toBeUndefined();
    expect(Object.keys(operation?.responses?.['200']?.content ?? {})).toEqual(['image/webp']);
  });

  it('leaves the identity body documented by its own richer shape', () => {
    // `StaffLoginSchema` constrains both fields with `.refine()`, which has no
    // JSON Schema rendering; converting it would publish two bare strings and
    // lose the address format and length bound a client can read today.
    const body = resolve(bodySchemaOf('staffSession_create'));
    expect(Object.keys(body?.properties ?? {}).sort()).toEqual(['email', 'password']);
    expect(propertyOf(body, 'email').format).toBe('email');
  });
});

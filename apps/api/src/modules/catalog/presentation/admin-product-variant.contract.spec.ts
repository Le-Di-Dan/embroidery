/**
 * The Admin variant HTTP contract (`APP12-N02.B01`), asserted from source and
 * from the published artifacts.
 *
 * Two kinds of claim need this file. The first is an **absence**: a DELETE
 * appearing here would silently make variant history destroyable, and dropping
 * one guard from one handler would leave every functional test passing while an
 * unauthenticated or cross-origin caller could author variants. The second is a
 * **published** fact: a body that validates at runtime but publishes `{}` gives
 * the generated client an open bag, so the committed OpenAPI artifact is read
 * directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOperationId } from '../../../openapi/operation-id';
import { AdminProductVariantController } from './admin-product-variant.controller';
import {
  createProductVariantBodySchema,
  productVariantParamsSchema,
  updateProductVariantBodySchema,
} from './schemas/admin-product-variant.request';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'admin-product-variant.controller.ts'),
  'utf8',
);

interface OpenApiDocument {
  readonly paths: Record<
    string,
    Record<string, { operationId?: string; requestBody?: unknown; security?: unknown }>
  >;
  readonly components: { readonly schemas: Record<string, Record<string, unknown>> };
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as OpenApiDocument;

const LIST_PATH = '/api/admin/products/{productId}/variants';
const ITEM_PATH = '/api/admin/products/{productId}/variants/{variantId}';

describe('APP12-N02.B01 Admin variant contract', () => {
  describe('exactly three operations', () => {
    it('declares three handlers and nothing else', () => {
      const methods = CONTROLLER_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
      expect(methods.map((method) => method.trim())).toEqual(['@Get(', '@Post(', '@Patch(']);
    });

    it('publishes no delete, anywhere', () => {
      // The absence is the contract (`N02.D01` §E): a variant leaves the
      // catalog by `isActive`, which is what keeps the commercial history that
      // references it readable. No route, no method, no body field.
      expect(CONTROLLER_SOURCE).not.toMatch(/@(Delete|Put)\s*\(/);
      expect(Object.keys(OPENAPI.paths[LIST_PATH] ?? {}).sort()).toEqual(['get', 'post']);
      expect(Object.keys(OPENAPI.paths[ITEM_PATH] ?? {})).toEqual(['patch']);
    });

    it('publishes exactly the three operation ids the naming policy derives', () => {
      const name = AdminProductVariantController.name;
      expect(createOperationId(name, 'list')).toBe('adminProductVariant_list');
      expect(createOperationId(name, 'create')).toBe('adminProductVariant_create');
      expect(createOperationId(name, 'update')).toBe('adminProductVariant_update');
      // Derived, so no `CONTROLLER_DOMAIN_KEYS` entry is owed and a file-layout
      // decision can never rename a public identifier.
      expect(OPENAPI.paths[LIST_PATH]?.get?.operationId).toBe('adminProductVariant_list');
      expect(OPENAPI.paths[LIST_PATH]?.post?.operationId).toBe('adminProductVariant_create');
      expect(OPENAPI.paths[ITEM_PATH]?.patch?.operationId).toBe('adminProductVariant_update');
    });
  });

  describe('guards', () => {
    it('authenticates every operation at the controller', () => {
      expect(CONTROLLER_SOURCE).toMatch(
        /@Controller\('admin\/products'\)\s*@UseGuards\(AuthenticatedAdminGuard\)/,
      );
    });

    it('adds the origin and JSON-body guards to both writes and to neither read', () => {
      const writeGuards =
        CONTROLLER_SOURCE.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g) ?? [];
      expect(writeGuards).toHaveLength(2);
    });
  });

  describe('the published request bodies', () => {
    it('are closed objects, not open bags', () => {
      for (const name of ['CreateProductVariantBody', 'UpdateProductVariantBody']) {
        const schema = OPENAPI.components.schemas[name];
        expect(schema).toBeDefined();
        expect(schema?.additionalProperties).toBe(false);
        expect(Object.keys(schema?.properties as Record<string, unknown>).sort()).toEqual([
          'colorName',
          'isActive',
          'sizeLabel',
        ]);
      }
    });

    it('publish no displayOrder, no productId and no id', () => {
      const serialized = JSON.stringify([
        OPENAPI.components.schemas.CreateProductVariantBody,
        OPENAPI.components.schemas.UpdateProductVariantBody,
      ]);
      for (const forbidden of ['displayOrder', 'productId', 'variantId', 'createdAt', 'skus']) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('publish no stock field on the response either', () => {
      const serialized = JSON.stringify([
        OPENAPI.components.schemas.AdminProductVariantResponse,
        OPENAPI.components.schemas.AdminVariantSkuResponse,
        OPENAPI.components.schemas.AdminProductVariantListResponse,
      ]).toLowerCase();
      for (const forbidden of ['quantity', 'stock', 'threshold', 'reserved']) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('request validation', () => {
    it('rejects an unknown field rather than dropping it', () => {
      expect(
        createProductVariantBodySchema.safeParse({ colorName: 'Đen', displayOrder: 3 }).success,
      ).toBe(false);
      expect(updateProductVariantBodySchema.safeParse({ productId: 'x' }).success).toBe(false);
    });

    it('defaults a create to active', () => {
      const parsed = createProductVariantBodySchema.parse({ colorName: 'Đen' });
      expect(parsed.isActive).toBe(true);
    });

    it('accepts null and a blank string for either label', () => {
      expect(
        createProductVariantBodySchema.safeParse({ colorName: null, sizeLabel: '' }).success,
      ).toBe(true);
      expect(updateProductVariantBodySchema.safeParse({ colorName: null }).success).toBe(true);
    });

    it('refuses an empty patch', () => {
      expect(updateProductVariantBodySchema.safeParse({}).success).toBe(false);
    });

    it('rejects a path parameter that is not a UUID before any repository call', () => {
      expect(
        productVariantParamsSchema.safeParse({ productId: 'not-a-uuid', variantId: 'x' }).success,
      ).toBe(false);
    });
  });
});

/**
 * `APP12-M01.B2` — the published contract of the one bounded media write.
 *
 * Read from the **committed artifacts** — the OpenAPI document and the
 * generated client — because those are what a consumer actually compiles
 * against; a body that validates at runtime but publishes `{}` would hand the
 * client an open bag while every functional test still passed. Docker-free: no
 * database, no container, no network.
 *
 * The bounds matter as much as the addition. B2 is authorised for **exactly
 * one** new HTTP path and one new operation, so the assertions are two-sided:
 * the operation exists with the agreed id and shape, the Admin product surface
 * grew by precisely one path, the public surface not at all, and no separate
 * add / remove / reorder / set-primary route appeared beside it. A later change
 * that split this into four endpoints would pass every functional test in the
 * repository; it fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOperationId } from '../../../openapi/operation-id';
import { MAX_PRODUCT_MEDIA_ITEMS } from '../domain/product-draft.policy';
import { AdminProductMediaController } from './admin-product-media.controller';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

interface OpenApiDocument {
  readonly paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        requestBody?: { content: Record<string, { schema?: { $ref?: string } }> };
        responses?: Record<string, unknown>;
      }
    >
  >;
  readonly components: { readonly schemas: Record<string, Record<string, unknown>> };
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as OpenApiDocument;

const CLIENT_SCHEMAS = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.schemas.ts'),
  'utf8',
);

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'admin-product-media.controller.ts'),
  'utf8',
);

const MEDIA_PATH = '/api/admin/products/{productId}/media';
const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete'];

function methodsOf(path: string): string[] {
  return Object.keys(OPENAPI.paths[path] ?? {}).filter((key) => HTTP_METHODS.includes(key));
}

describe('APP12-M01.B2 Admin product media contract', () => {
  describe('exactly one operation', () => {
    it('declares one handler and publishes it as PUT', () => {
      const handlers = CONTROLLER_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
      expect(handlers.map((handler) => handler.trim())).toEqual(['@Put(']);
      expect(methodsOf(MEDIA_PATH)).toEqual(['put']);
    });

    it('publishes the operation id the naming policy derives', () => {
      expect(createOperationId(AdminProductMediaController.name, 'replace')).toBe(
        'adminProductMedia_replace',
      );
      expect(OPENAPI.paths[MEDIA_PATH]?.put?.operationId).toBe('adminProductMedia_replace');
    });

    it('adds no second media-mutation route beside it', () => {
      const productPaths = Object.keys(OPENAPI.paths).filter((path) =>
        path.startsWith('/api/admin/products'),
      );
      // §3 forbids separate add / remove / reorder / set-primary endpoints, so
      // the whole media surface is this one path.
      expect(productPaths.filter((path) => path.includes('/media'))).toEqual([MEDIA_PATH]);
      expect(productPaths.filter((path) => /primary|reorder|cover/i.test(path))).toEqual([]);
    });
  });

  describe('the ordered array is the whole write model', () => {
    it('takes exactly the token and the id array', () => {
      const ref =
        OPENAPI.paths[MEDIA_PATH]?.put?.requestBody?.content['application/json']?.schema?.$ref;
      expect(ref).toBe('#/components/schemas/ReplaceProductMediaBody');

      const body = OPENAPI.components.schemas['ReplaceProductMediaBody'] as {
        properties?: Record<string, Record<string, unknown>>;
        required?: string[];
        additionalProperties?: boolean;
      };
      expect(Object.keys(body.properties ?? {}).sort()).toEqual([
        'expectedUpdatedAt',
        'mediaAssetIds',
      ]);
      expect([...(body.required ?? [])].sort()).toEqual(['expectedUpdatedAt', 'mediaAssetIds']);
      // Nothing else can be stated, so no request can describe two primaries,
      // a gap, or a role the server owns.
      expect(body.additionalProperties).toBe(false);
    });

    it('publishes the same cap the domain enforces', () => {
      const body = OPENAPI.components.schemas['ReplaceProductMediaBody'] as {
        properties?: Record<string, Record<string, unknown>>;
      };
      const media = body.properties?.['mediaAssetIds'];
      expect(media).toMatchObject({ type: 'array', maxItems: MAX_PRODUCT_MEDIA_ITEMS });
      expect(media?.['items']).toMatchObject({ type: 'string' });
    });

    it('reaches the generated client as that same array', () => {
      expect(CLIENT_SCHEMAS).toContain('ReplaceProductMediaBody');
      const declaration = /export interface ReplaceProductMediaBody \{[\s\S]*?\n\}/.exec(
        CLIENT_SCHEMAS,
      )?.[0];
      expect(declaration).toBeDefined();
      expect(declaration).toContain('mediaAssetIds: string[]');
      expect(declaration).not.toMatch(/isPrimary|role|position|displayOrder/);
    });
  });

  describe('bounds', () => {
    it('reuses the existing Admin product representation for its response', () => {
      // No new response schema: the operation answers with the same detail
      // payload `adminProduct_detail` returns.
      expect(JSON.stringify(OPENAPI.paths[MEDIA_PATH]?.put?.responses)).toContain(
        'AdminProductDetailResponse',
      );
    });

    it('leaves the public operation count at 49', () => {
      const publicOperations = Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
        path.startsWith('/api/public/')
          ? Object.keys(item).filter((key) => HTTP_METHODS.includes(key))
          : [],
      );
      expect(publicOperations).toHaveLength(49);
    });

    it('carries the full Admin guard chain on the one handler', () => {
      // Dropping one of these would leave every functional test passing while
      // an unauthenticated or cross-origin caller could rewrite a published
      // product's gallery.
      expect(CONTROLLER_SOURCE).toContain('@UseGuards(AuthenticatedAdminGuard)');
      expect(CONTROLLER_SOURCE).toContain('@UseGuards(StaffOriginGuard, StaffJsonBodyGuard)');
    });
  });
});

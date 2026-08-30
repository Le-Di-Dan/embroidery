/**
 * The `APP11-B03A` contract boundary, asserted without a database.
 *
 * Four things are proved here and nowhere else:
 *
 * 1. **The published surface grew by exactly two operations.** The prompt caps
 *    the checkpoint at three; a route added early or a fourth minted by
 *    accident is invisible in a behaviour test that never calls it.
 * 2. **The create DTO cannot express policy.** `kind`, `classification`,
 *    `status`, `storageKey`, `bucket`, `derivativeKind` and `altText` are
 *    refused at the request boundary rather than dropped, so a caller cannot
 *    believe it chose a lane, a state or an object address.
 * 3. **The existing Admin asset reads kept their default.** `scope` is optional
 *    on both, and the delivered lane is still `CATALOG` — the one property that
 *    stops a public showcase image appearing in a product-media picker.
 * 4. **Intake still cannot reach `PUBLIC`.** INV-09 is asserted against the
 *    upload's own documented body, not against a comment about it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ZodType } from 'zod';

import { zodSchemaOf } from '../../../platform/validation';
import {
  DEFAULT_ADMIN_ASSET_SCOPE,
  GALLERY_ASSET_CLASSIFICATION,
  GALLERY_ASSET_KIND,
  LANE_BY_ADMIN_ASSET_SCOPE,
} from '../../asset/domain/admin-asset-scope.policy';
import { GALLERY_ENTRY_ASSET_CLASSIFICATION } from '../domain/admin-gallery-entry.policy';
import {
  PREPARED_DERIVATIVE_KINDS,
  PREPARED_GALLERY_ASSET_STATUS,
  PREPARATION_SOURCE_STATUS,
} from '../domain/gallery-asset-preparation.policy';
import { PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES } from '../domain/public-gallery-media.policy';
import {
  AdminGalleryAssetPreviewParams,
  PrepareGalleryAssetBody,
} from './schemas/admin-gallery-asset.request';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        parameters?: readonly { name: string; in: string; required?: boolean }[];
        requestBody?: unknown;
      }
    >
  >;
};

const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);

const COLLECTION = '/api/admin/gallery-assets';
const PREVIEW = '/api/admin/gallery-assets/{assetId}/{rendition}';
const ASSET_LIST = '/api/admin/assets';
const ASSET_DETAIL = '/api/admin/assets/{assetId}';
const UPLOAD = '/api/admin/assets/upload';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'admin-gallery-asset.controller.ts'),
  'utf8',
);
const SERVICE_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'admin-gallery-asset-preparation.service.ts'),
  'utf8',
);

/** Drops block and line comments so a structural check reads code, not prose. */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

function schemaOf(dto: unknown): ZodType {
  const schema = zodSchemaOf(dto);
  if (schema === undefined) {
    throw new Error('the DTO carries no Zod schema');
  }
  return schema;
}

const SOURCE_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const VALID_CREATE = {
  sourceAssetId: SOURCE_ID,
  expectedSourceUpdatedAt: '2026-08-30T04:05:06.000Z',
};

function operationIds(): readonly string[] {
  return Object.values(OPENAPI.paths).flatMap((item) =>
    Object.values(item)
      .map((operation) => operation.operationId)
      .filter((id): id is string => typeof id === 'string'),
  );
}

describe('APP11-B03A Admin gallery asset contract', () => {
  describe('published surface', () => {
    it('publishes exactly the two B03A operations, and no third', () => {
      expect(OPENAPI.paths[COLLECTION]?.['post']?.operationId).toBe('adminGalleryAsset_create');
      expect(OPENAPI.paths[PREVIEW]?.['get']?.operationId).toBe('adminGalleryAsset_preview');

      const added = operationIds().filter((id) => id.startsWith('adminGalleryAsset_'));
      expect(added.sort()).toEqual(['adminGalleryAsset_create', 'adminGalleryAsset_preview']);
    });

    it('adds no operation under the gallery-asset path beyond those two', () => {
      const methods = Object.keys(OPENAPI.paths[COLLECTION] ?? {});
      expect(methods).toEqual(['post']);
      expect(Object.keys(OPENAPI.paths[PREVIEW] ?? {})).toEqual(['get']);
    });

    it('reaches the generated client, so the contract is callable', () => {
      expect(CLIENT_SOURCE).toContain('adminGalleryAssetCreate');
      expect(CLIENT_SOURCE).toContain('adminGalleryAssetPreview');
    });

    it('adds no public gallery-asset address, and mints no sitemap operation itself', () => {
      expect(Object.keys(OPENAPI.paths)).not.toContain('/api/public/gallery-assets');
      expect(operationIds().some((id) => id.startsWith('publicAsset'))).toBe(false);
      // `APP11-B04` delivered the one sitemap operation afterwards, so the
      // claim B03A owns is that the sitemap family is not *its* — the id
      // belongs to the SEO surface and none of this checkpoint's own three
      // ids resemble it.
      expect(operationIds().filter((id) => id.toLowerCase().includes('sitemap'))).toEqual([
        'publicSitemapEntry_list',
      ]);
      expect(
        operationIds().filter((id) => id.startsWith('adminGalleryAsset') && /sitemap/i.test(id)),
      ).toEqual([]);
    });
  });

  describe('create request boundary', () => {
    const schema = schemaOf(PrepareGalleryAssetBody);

    it('accepts the source identity and its version token', () => {
      expect(schema.safeParse(VALID_CREATE).success).toBe(true);
    });

    it.each([
      ['kind', { kind: GALLERY_ASSET_KIND }],
      ['classification', { classification: GALLERY_ASSET_CLASSIFICATION }],
      ['status', { status: PREPARED_GALLERY_ASSET_STATUS }],
      ['storageKey', { storageKey: 'development/originals/x/original.png' }],
      ['bucket', { bucket: 'DERIVATIVES' }],
      ['derivativeKind', { derivativeKind: 'THUMBNAIL' }],
      ['altText', { altText: 'Áo thêu hoa sen' }],
      ['assetId', { assetId: SOURCE_ID }],
    ])('refuses a caller-chosen %s rather than dropping it', (_field, extra) => {
      expect(schema.safeParse({ ...VALID_CREATE, ...extra }).success).toBe(false);
    });

    it('requires the version token; an unguarded promotion is not expressible', () => {
      expect(schema.safeParse({ sourceAssetId: SOURCE_ID }).success).toBe(false);
    });

    it('requires an offset-bearing instant, the spelling the detail read publishes', () => {
      expect(
        schema.safeParse({ ...VALID_CREATE, expectedSourceUpdatedAt: '2026-08-30 04:05:06' })
          .success,
      ).toBe(false);
    });

    it('requires a well-formed source id', () => {
      expect(schema.safeParse({ ...VALID_CREATE, sourceAssetId: 'not-a-uuid' }).success).toBe(
        false,
      );
    });
  });

  describe('preview request boundary', () => {
    const schema = schemaOf(AdminGalleryAssetPreviewParams);

    it('accepts the two public renditions and nothing else', () => {
      expect(schema.safeParse({ assetId: SOURCE_ID, rendition: 'thumbnail' }).success).toBe(true);
      expect(schema.safeParse({ assetId: SOURCE_ID, rendition: 'catalog-preview' }).success).toBe(
        true,
      );
      expect(schema.safeParse({ assetId: SOURCE_ID, rendition: 'original' }).success).toBe(false);
      expect(schema.safeParse({ assetId: SOURCE_ID, rendition: 'NORMALIZED' }).success).toBe(false);
    });

    it('refuses a path-shaped id, so no segment can address an object', () => {
      expect(
        schema.safeParse({ assetId: '../../originals/secret', rendition: 'thumbnail' }).success,
      ).toBe(false);
    });
  });

  describe('the existing Admin asset reads keep their delivered behaviour', () => {
    it('leaves `scope` optional on both reads', () => {
      for (const path of [ASSET_LIST, ASSET_DETAIL]) {
        const scope = OPENAPI.paths[path]?.['get']?.parameters?.find(
          (parameter) => parameter.name === 'scope',
        );
        expect(scope).toBeDefined();
        expect(scope?.required ?? false).toBe(false);
        expect(scope?.in).toBe('query');
      }
    });

    it('defaults an omitted scope to the catalog lane', () => {
      expect(DEFAULT_ADMIN_ASSET_SCOPE).toBe('CATALOG');
      expect(LANE_BY_ADMIN_ASSET_SCOPE.CATALOG).toEqual({
        kind: 'CATALOG_MEDIA',
        classification: 'PRODUCTION_SENSITIVE',
      });
    });

    it('never unions the two lanes', () => {
      expect(LANE_BY_ADMIN_ASSET_SCOPE.GALLERY).toEqual({
        kind: GALLERY_ASSET_KIND,
        classification: GALLERY_ASSET_CLASSIFICATION,
      });
      expect(LANE_BY_ADMIN_ASSET_SCOPE.CATALOG).not.toEqual(LANE_BY_ADMIN_ASSET_SCOPE.GALLERY);
    });
  });

  describe('locked invariants', () => {
    it('keeps the gallery lane exactly what APP11-B02 will attach', () => {
      // Held together by this assertion rather than by an import Asset must not
      // have: `GALLERY_ASSET_CLASSIFICATION` and B02's own boundary constant
      // have to name one classification, or a prepared image would be refused
      // by the very operation it exists to feed.
      expect(GALLERY_ASSET_CLASSIFICATION).toBe(GALLERY_ENTRY_ASSET_CLASSIFICATION);
    });

    it('mints a state APP11-B03 can actually deliver', () => {
      expect(PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES).not.toContain(PREPARED_GALLERY_ASSET_STATUS);
    });

    it('prepares exactly the renditions the public route can be asked for', () => {
      expect([...PREPARED_DERIVATIVE_KINDS].sort()).toEqual(['CATALOG_PREVIEW', 'THUMBNAIL']);
    });

    it('promotes only from an inspected source', () => {
      expect(PREPARATION_SOURCE_STATUS).toBe('ACCEPTED');
    });

    it('leaves the upload unable to choose a lane at all (INV-09)', () => {
      const body = JSON.stringify(OPENAPI.paths[UPLOAD]?.['post']?.requestBody ?? {});
      expect(body).toContain('PRODUCTION_SENSITIVE');
      expect(body).not.toContain(GALLERY_ASSET_CLASSIFICATION);
      expect(body).not.toContain(GALLERY_ASSET_KIND);
    });

    it('never mutates the source: no write port and no update reaches it', () => {
      const service = withoutComments(SERVICE_SOURCE);
      // The Asset contract's mutating members, none of which may be applied to
      // the source. `register`, `recordInspection`, `registerDerivative` and
      // `completeDerivative` do appear — every one of them addressed to the
      // freshly allocated derived id.
      expect(service).not.toMatch(/tombstone|beginInspection|failDerivative/);
      expect(service).not.toMatch(/lockForUpdate|for\('update'\)/);
      // Every write names `derivedId` or a plan key, never `sourceId`.
      expect(service).not.toMatch(/register\(\{\s*id:\s*sourceId/);
    });

    it('keeps the controller free of orchestration', () => {
      const controller = withoutComments(CONTROLLER_SOURCE);
      expect(controller).not.toMatch(/TransactionManager|copyObject|ASSET_REPOSITORY|storageKey/);
    });
  });
});

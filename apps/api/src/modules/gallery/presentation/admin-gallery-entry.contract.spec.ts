/**
 * The `APP11-B01` contract boundary, asserted without a database.
 *
 * Two things are proved here and nowhere else:
 *
 * 1. **The published contract is exactly four Admin operations.** Not five, not
 *    a public gallery read, not a publication command and not an asset
 *    mutation. Those belong to `APP11-B02`/`B03`, and a route added early is
 *    invisible in a behaviour test that never calls it.
 * 2. **The DTO refuses what the checkpoint forbids.** `slug`, `status`,
 *    `archivedAt`, `assetIds` and `altText` are rejected at the request
 *    boundary rather than dropped, so a caller cannot believe it renamed,
 *    published or re-ordered anything.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ZodType } from 'zod';

import { zodSchemaOf } from '../../../platform/validation';
import {
  CreateGalleryEntryBody,
  GalleryEntryIdParam,
  ListGalleryEntriesQuery,
  UpdateGalleryEntryBody,
} from './schemas/admin-gallery-entry.request';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<string, Record<string, { operationId?: string }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

/**
 * The generated client is asserted too: an operation that exists in the
 * document but never reached the client is a contract nobody can call.
 */
const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);

const COLLECTION = '/api/admin/gallery-entries';
const ITEM = '/api/admin/gallery-entries/{galleryEntryId}';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'admin-gallery-entry.controller.ts'),
  'utf8',
);
const SERVICE_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'admin-gallery-entry.service.ts'),
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

const VALID_CREATE = {
  title: 'Áo thêu hoa sen',
  slug: 'ao-theu-hoa-sen',
  description: 'Thêu tay trên vải lanh.',
  displayOrder: 10,
  isIndexable: true,
};

describe('APP11-B01 Admin gallery entry contract', () => {
  describe('published surface', () => {
    it('publishes its four Admin operations, with the canonical ids', () => {
      expect(OPENAPI.paths[COLLECTION]?.['get']?.operationId).toBe('adminGalleryEntry_list');
      expect(OPENAPI.paths[COLLECTION]?.['post']?.operationId).toBe('adminGalleryEntry_create');
      expect(OPENAPI.paths[ITEM]?.['get']?.operationId).toBe('adminGalleryEntry_detail');
      expect(OPENAPI.paths[ITEM]?.['patch']?.operationId).toBe('adminGalleryEntry_update');

      const galleryOperations = Object.values(OPENAPI.paths)
        .flatMap((item) => Object.values(item))
        .map((operation) => operation.operationId ?? '')
        .filter((id) => id.startsWith('adminGalleryEntry'));

      // The whole published **Admin** Gallery family. `APP11-B02` added three
      // ids to it through `CONTROLLER_DOMAIN_KEYS`, which is exactly why the
      // assertion is an equality: a fifth authoring route, or an id minted from
      // a controller split, still fails here by name. `APP11-B03`'s three
      // `publicGalleryEntry_*` ids are a different family and are pinned by
      // their own contract suite; the filter names the prefix rather than
      // matching "gallery" anywhere, so the two cannot be confused.
      expect(galleryOperations.sort()).toEqual([
        'adminGalleryEntry_create',
        'adminGalleryEntry_detail',
        'adminGalleryEntry_list',
        'adminGalleryEntry_publish',
        'adminGalleryEntry_replaceAssets',
        'adminGalleryEntry_unpublish',
        'adminGalleryEntry_update',
      ]);
    });

    it('publishes no fifth Admin gallery, sitemap or content-page route', () => {
      const adminGalleryPaths = Object.keys(OPENAPI.paths).filter((path) =>
        path.startsWith('/api/admin/gallery-entries'),
      );

      // Four Path Item Objects: B01's collection and item, and B02's two
      // sub-resources. No fifth.
      expect(adminGalleryPaths.sort()).toEqual(
        [COLLECTION, ITEM, `${ITEM}/assets`, `${ITEM}/publication`].sort(),
      );
      // `APP11-B03` delivered the public gallery surface and `APP11-B04` the
      // one public sitemap operation, so this assertion is now about the Admin
      // scope only: neither of those is an Admin gallery route, and the
      // content-page surface is still unbuilt — named so the day one appears
      // this fails by name rather than by count.
      expect(OPENAPI.paths['/api/admin/content-pages']).toBeUndefined();
      for (const path of adminGalleryPaths) {
        expect(path).not.toMatch(/sitemap|content-pages?/i);
      }
    });

    it('regenerates the client through the canonical tooling', () => {
      for (const operation of [
        'adminGalleryEntryList',
        'adminGalleryEntryCreate',
        'adminGalleryEntryDetail',
        'adminGalleryEntryUpdate',
      ]) {
        expect(CLIENT_SOURCE).toContain(operation);
      }
    });

    it('exposes no per-image alt text anywhere in the Gallery DTO family', () => {
      // `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` (APP11-D01-C1): there is no
      // column, so there must be no property — in a request or a response.
      const gallerySchemas = Object.entries(OPENAPI.components.schemas).filter(([name]) =>
        /Gallery/i.test(name),
      );
      expect(gallerySchemas.length).toBeGreaterThan(0);
      for (const [name, schema] of gallerySchemas) {
        expect(`${name}:${JSON.stringify(schema)}`).not.toMatch(/alt[_ ]?text/i);
      }
    });

    it('never reaches the lifecycle or association writers from the B01 files', () => {
      // `changeStatus` and `attachAsset` exist on the AGG-18 repository and are
      // `APP11-B02`'s. Named structurally: a call added later would otherwise
      // only show up as a behaviour nobody wrote a test for. Comments are
      // stripped first — both files *name* the two methods to record that they
      // are deliberately not called, and prose must not fail the check.
      for (const source of [CONTROLLER_SOURCE, SERVICE_SOURCE]) {
        expect(withoutComments(source)).not.toMatch(/changeStatus|attachAsset/);
      }
    });
  });

  describe('create body', () => {
    const schema = schemaOf(CreateGalleryEntryBody);

    it('accepts the authoring fields the checkpoint owns', () => {
      expect(schema.safeParse(VALID_CREATE).success).toBe(true);
      expect(
        schema.safeParse({
          ...VALID_CREATE,
          linkedProductId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
          seoTitle: 'Áo thêu hoa sen',
          seoDescription: 'Sản phẩm thêu tay.',
        }).success,
      ).toBe(true);
    });

    it.each([
      ['status', { status: 'PUBLISHED' }],
      ['archivedAt', { archivedAt: '2026-08-30T00:00:00.000Z' }],
      ['assetIds', { assetIds: ['019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07'] }],
      ['altText', { altText: 'Một chiếc áo' }],
      ['category', { category: 'ao' }],
      ['style', { style: 'co-dien' }],
      ['need', { need: 'qua-tang' }],
      ['createdAt', { createdAt: '2026-08-30T00:00:00.000Z' }],
      ['updatedAt', { updatedAt: '2026-08-30T00:00:00.000Z' }],
    ])('rejects the server-owned field %s', (_label, extra) => {
      expect(schema.safeParse({ ...VALID_CREATE, ...extra }).success).toBe(false);
    });

    it.each(['Ao-Theu', 'ao theu', 'ao--theu', '-ao-theu', 'ao_theu', 'áo-thêu', ''])(
      'rejects the non-canonical slug %p',
      (slug) => {
        expect(schema.safeParse({ ...VALID_CREATE, slug }).success).toBe(false);
      },
    );

    it('requires a slug, a title and an indexability decision', () => {
      for (const missing of ['slug', 'title', 'isIndexable', 'description', 'displayOrder']) {
        const body: Record<string, unknown> = { ...VALID_CREATE };
        delete body[missing];
        expect(schema.safeParse(body).success).toBe(false);
      }
    });
  });

  describe('patch body', () => {
    const schema = schemaOf(UpdateGalleryEntryBody);

    it('accepts every editable field', () => {
      expect(
        schema.safeParse({
          title: 'Tên mới',
          description: 'Mô tả mới',
          displayOrder: 3,
          isIndexable: false,
          linkedProductId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
          seoTitle: 'SEO',
          seoDescription: 'SEO mô tả',
        }).success,
      ).toBe(true);
    });

    it('clears the optional relationships with an explicit null', () => {
      expect(schema.safeParse({ linkedProductId: null }).success).toBe(true);
      expect(schema.safeParse({ seoTitle: null }).success).toBe(true);
      expect(schema.safeParse({ seoDescription: null }).success).toBe(true);
    });

    it.each([
      ['slug', { slug: 'ten-moi' }],
      ['status', { status: 'PUBLISHED' }],
      ['archivedAt', { archivedAt: '2026-08-30T00:00:00.000Z' }],
      ['assetIds', { assetIds: [] }],
      ['altText', { altText: 'Một chiếc áo' }],
    ])('refuses to change %s', (_label, body) => {
      expect(schema.safeParse(body).success).toBe(false);
    });

    it('rejects an empty patch', () => {
      expect(schema.safeParse({}).success).toBe(false);
    });

    it('never clears a NOT NULL column', () => {
      expect(schema.safeParse({ title: null }).success).toBe(false);
      expect(schema.safeParse({ description: null }).success).toBe(false);
    });
  });

  describe('list query and path parameter', () => {
    it('accepts only status, limit and cursor', () => {
      const schema = schemaOf(ListGalleryEntriesQuery);
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ status: 'DRAFT', limit: '25', cursor: 'abc' }).success).toBe(true);
      expect(schema.safeParse({ status: 'SOMETHING' }).success).toBe(false);
      expect(schema.safeParse({ limit: '101' }).success).toBe(false);
      // No search, category, style or date filter exists in B01.
      for (const extra of [{ q: 'ao' }, { category: 'ao' }, { style: 'co-dien' }]) {
        expect(schema.safeParse(extra).success).toBe(false);
      }
    });

    it('rejects a path parameter that is not a UUID', () => {
      const schema = schemaOf(GalleryEntryIdParam);
      expect(schema.safeParse({ galleryEntryId: 'not-a-uuid' }).success).toBe(false);
      expect(
        schema.safeParse({ galleryEntryId: '019b1c2d-3e4f-7a50-9b6c-1d2e3f405162' }).success,
      ).toBe(true);
    });
  });
});

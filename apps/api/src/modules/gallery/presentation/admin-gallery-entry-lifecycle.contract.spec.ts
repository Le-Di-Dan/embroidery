/**
 * The `APP11-B02` contract boundary, asserted without a database.
 *
 * Three things are proved here and nowhere else:
 *
 * 1. **The published delta is exactly three Admin operations**, on two new Path
 *    Item Objects, carrying the canonical `adminGalleryEntry_*` ids — so the
 *    controller split did not fork the public contract — and reaching the
 *    generated client.
 * 2. **The DTOs refuse what the checkpoint forbids.** No `status`,
 *    `archivedAt`, `altText`, `position`, `role` or `displayOrder` is
 *    accepted, and every one of the three commands demands the concurrency
 *    token: a body without `expectedUpdatedAt` is a 400, not an unguarded
 *    write.
 * 3. **Nothing outside B02's scope appeared.** No public gallery route, no
 *    sitemap operation, no content-page route, no per-image alt text anywhere
 *    in the Gallery schema family, and no migration.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ZodType } from 'zod';

import { zodSchemaOf } from '../../../platform/validation';
import { evaluateGalleryPublicationReadiness } from '../domain/admin-gallery-entry.readiness';
import {
  PublishGalleryEntryBody,
  ReplaceGalleryEntryAssetsBody,
  UnpublishGalleryEntryBody,
} from './schemas/admin-gallery-entry-lifecycle.request';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<string, Record<string, { operationId?: string }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);

const ITEM = '/api/admin/gallery-entries/{galleryEntryId}';
const ASSETS = `${ITEM}/assets`;
const PUBLICATION = `${ITEM}/publication`;

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'admin-gallery-entry-lifecycle.controller.ts'),
  'utf8',
);
const SERVICE_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'admin-gallery-entry-lifecycle.service.ts'),
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

const TOKEN = '2026-08-30T10:00:00.000Z';
const ASSET_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const ASSET_B = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';

describe('APP11-B02 Admin gallery media & publication contract', () => {
  describe('published surface', () => {
    it('publishes exactly the three operations, with the canonical ids', () => {
      expect(OPENAPI.paths[ASSETS]?.['put']?.operationId).toBe('adminGalleryEntry_replaceAssets');
      expect(OPENAPI.paths[PUBLICATION]?.['post']?.operationId).toBe('adminGalleryEntry_publish');
      expect(OPENAPI.paths[PUBLICATION]?.['delete']?.operationId).toBe(
        'adminGalleryEntry_unpublish',
      );

      // The two new Path Item Objects carry nothing else — no GET readiness
      // report, no PATCH reorder, no fourth operation of any kind.
      expect(Object.keys(OPENAPI.paths[ASSETS] ?? {}).sort()).toEqual(['put']);
      expect(Object.keys(OPENAPI.paths[PUBLICATION] ?? {}).sort()).toEqual(['delete', 'post']);
    });

    it('keeps the ids inside the family APP11-B01 already published', () => {
      // The split controller must not mint an `adminGalleryEntryLifecycle_*`
      // family: a file-size decision may not name a public identifier.
      const ids = Object.values(OPENAPI.paths)
        .flatMap((item) => Object.values(item))
        .map((operation) => operation.operationId ?? '');

      expect(ids.filter((id) => id.startsWith('adminGalleryEntryLifecycle'))).toEqual([]);
      expect(ids).toContain('adminGalleryEntry_replaceAssets');
    });

    it('reaches the generated client through the canonical tooling', () => {
      for (const operation of [
        'adminGalleryEntryReplaceAssets',
        'adminGalleryEntryPublish',
        'adminGalleryEntryUnpublish',
      ]) {
        expect(CLIENT_SOURCE).toContain(operation);
      }
    });

    it('publishes no fifth Admin gallery, sitemap or content-page route', () => {
      // `APP11-B03` delivered the three public gallery routes and `APP11-B04`
      // the one public sitemap operation, so this assertion is now about the
      // Admin scope only — B02's own boundary, which is that media selection
      // and publication added no fifth Admin path. The content-page surface is
      // still unbuilt.
      expect(OPENAPI.paths['/api/admin/content-pages']).toBeUndefined();
      const adminGalleryPaths = Object.keys(OPENAPI.paths).filter((path) =>
        path.startsWith('/api/admin/gallery-entries'),
      );
      expect(adminGalleryPaths).toHaveLength(4);
      for (const path of adminGalleryPaths) {
        expect(path).not.toMatch(/sitemap|content-pages?/i);
      }
    });

    it('exposes no per-image alt text anywhere in the Gallery DTO family', () => {
      // `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` (APP11-D01-C1): no column, so
      // no property — in a request or a response.
      const gallerySchemas = Object.entries(OPENAPI.components.schemas).filter(([name]) =>
        /Gallery/i.test(name),
      );
      expect(gallerySchemas.length).toBeGreaterThan(0);
      for (const [name, schema] of gallerySchemas) {
        expect(`${name}:${JSON.stringify(schema)}`).not.toMatch(/alt[_ ]?text/i);
      }
    });

    it('adds no migration', () => {
      const migrations = readdirSync(join(REPO_ROOT, 'packages/database/migrations')).filter(
        (file) => file.endsWith('.sql'),
      );
      // 37 when this checkpoint closed; `APP12-DB01` added
      // `0038_add_app12_ready_made_persistence.sql` under locked roadmap
      // authority. `APP12-H01` re-measured the directory and froze the count at
      // 38 (§19), so this now guards the Wave-1 release freeze as well as the
      // original claim that *this* checkpoint added nothing.
      expect(migrations.length).toBe(38);
    });

    it('never archives, deletes or mints a media address', () => {
      // Named structurally: unpublish is not archive and not delete, and B02
      // publishes no URL. A transition added later fails here by name rather
      // than escaping as behaviour nobody wrote a test for.
      //
      // The archive check reads the **service**, which is where a lifecycle
      // decision would live. The controller is excluded from it on purpose: its
      // OpenAPI descriptions are string literals that *promise* `archivedAt` is
      // never written, and comment-stripping cannot tell a documented promise
      // from a call. The storage check applies to both — neither file may name
      // a storage fact in prose or in code.
      expect(withoutComments(SERVICE_SOURCE)).not.toMatch(/ARCHIVED|archivedAt|archived_at/);
      for (const source of [CONTROLLER_SOURCE, SERVICE_SOURCE]) {
        expect(source).not.toMatch(/storageKey|storage_key|signedUrl|publicUrl/);
      }
    });
  });

  describe('replace-assets body', () => {
    const schema = schemaOf(ReplaceGalleryEntryAssetsBody);

    it('accepts an ordered selection and an empty one', () => {
      expect(
        schema.safeParse({ assetIds: [ASSET_A, ASSET_B], expectedUpdatedAt: TOKEN }).success,
      ).toBe(true);
      // Clearing the selection is a legitimate authoring request; only
      // publication readiness refuses it, and only later.
      expect(schema.safeParse({ assetIds: [], expectedUpdatedAt: TOKEN }).success).toBe(true);
    });

    it('demands the concurrency token', () => {
      expect(schema.safeParse({ assetIds: [ASSET_A] }).success).toBe(false);
      expect(
        schema.safeParse({ assetIds: [ASSET_A], expectedUpdatedAt: 'yesterday' }).success,
      ).toBe(false);
    });

    it.each([
      ['status', { status: 'PUBLISHED' }],
      ['archivedAt', { archivedAt: TOKEN }],
      ['altText', { altText: 'Một chiếc áo' }],
      ['position', { position: 0 }],
      ['displayOrder', { displayOrder: 3 }],
      ['role', { role: 'THUMBNAIL' }],
      ['coverAssetId', { coverAssetId: ASSET_A }],
    ])('rejects the server-owned field %s', (_label, extra) => {
      expect(
        schema.safeParse({ assetIds: [ASSET_A], expectedUpdatedAt: TOKEN, ...extra }).success,
      ).toBe(false);
    });

    it('rejects an asset id that is not a uuid', () => {
      expect(schema.safeParse({ assetIds: ['not-a-uuid'], expectedUpdatedAt: TOKEN }).success).toBe(
        false,
      );
    });
  });

  describe('publication bodies', () => {
    it.each([
      ['publish', PublishGalleryEntryBody],
      ['unpublish', UnpublishGalleryEntryBody],
    ])('%s carries the token and nothing else', (_label, dto) => {
      const schema = schemaOf(dto);

      expect(schema.safeParse({ expectedUpdatedAt: TOKEN }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
      // Everything else about the transition is server-owned.
      for (const extra of [
        { status: 'PUBLISHED' },
        { archivedAt: TOKEN },
        { reason: 'vì đẹp' },
        { publishedAt: TOKEN },
        { isIndexable: true },
      ]) {
        expect(schema.safeParse({ expectedUpdatedAt: TOKEN, ...extra }).success).toBe(false);
      }
    });
  });

  describe('publication readiness', () => {
    const READY = {
      title: 'Áo thêu hoa sen',
      slug: 'ao-theu-hoa-sen',
      description: 'Thêu tay trên vải lanh.',
      eligibleAssetCount: 1,
    };

    it('is satisfied by title, slug, description and one eligible image', () => {
      expect(evaluateGalleryPublicationReadiness(READY)).toEqual({
        eligible: true,
        unsatisfied: [],
      });
    });

    it.each([
      ['title', { title: '   ' }, 'GALLERY_ENTRY_TITLE_REQUIRED'],
      ['slug', { slug: '' }, 'GALLERY_ENTRY_SLUG_REQUIRED'],
      ['description', { description: '\n\t ' }, 'GALLERY_ENTRY_DESCRIPTION_REQUIRED'],
      ['eligible image', { eligibleAssetCount: 0 }, 'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED'],
    ])('names the missing %s', (_label, missing, code) => {
      const readiness = evaluateGalleryPublicationReadiness({ ...READY, ...missing });

      expect(readiness.eligible).toBe(false);
      expect(readiness.unsatisfied).toEqual([code]);
    });

    it('reports every unsatisfied requirement in the canonical order', () => {
      const readiness = evaluateGalleryPublicationReadiness({
        title: '',
        slug: '',
        description: '',
        eligibleAssetCount: 0,
      });

      expect(readiness.unsatisfied).toEqual([
        'GALLERY_ENTRY_TITLE_REQUIRED',
        'GALLERY_ENTRY_SLUG_REQUIRED',
        'GALLERY_ENTRY_DESCRIPTION_REQUIRED',
        'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED',
      ]);
    });

    it('does not require SEO text, a linked product or isIndexable', () => {
      // A `noindex` entry with no linked product and no SEO fields is a
      // perfectly publishable entry; readiness has no opinion about any of
      // them, which is why none of them is an input at all.
      expect(evaluateGalleryPublicationReadiness(READY).eligible).toBe(true);
      expect(Object.keys(READY).sort()).toEqual([
        'description',
        'eligibleAssetCount',
        'slug',
        'title',
      ]);
    });
  });
});

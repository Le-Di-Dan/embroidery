/**
 * The `APP11-B03` contract boundary, asserted without a database.
 *
 * Four things are proved here and nowhere else:
 *
 * 1. **The published delta is exactly three public GET operations**, on three
 *    new Path Item Objects, carrying the canonical `publicGalleryEntry_*` ids —
 *    so the controller split did not fork the public contract — and reaching
 *    the generated client.
 * 2. **The DTOs refuse what the checkpoint forbids.** No `status`, no search,
 *    no taxonomy filter, no offset; the slug grammar is the canonical one; the
 *    rendition vocabulary is closed to the two words `APP2-T01` already
 *    publishes.
 * 3. **The response contract leaks nothing.** No storage key, bucket, checksum,
 *    classification, lifecycle state, concurrency token, `linkedProductId` or
 *    `altText` anywhere in the public Gallery schema family.
 * 4. **Nothing outside B03's scope appeared.** No sitemap operation, no
 *    content-page route, no public write, no fourth gallery operation, no
 *    migration — and no authentication decorator on either public controller.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ZodType } from 'zod';

import { zodSchemaOf } from '../../../platform/validation';
import { PUBLIC_PRODUCT_MEDIA_RENDITIONS } from '../../catalog/domain/public-product-media.policy';
import { publicGalleryMediaPath } from '../domain/public-gallery-entry-path';
import {
  PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES,
  PUBLIC_GALLERY_DETAIL_RENDITION,
  PUBLIC_GALLERY_LIST_RENDITION,
  PUBLIC_GALLERY_MEDIA_RENDITIONS,
  PUBLIC_MEDIA_CACHE_CONTROL,
  resolveDerivativeKind,
} from '../domain/public-gallery-media.policy';
import { PUBLIC_GALLERY_ENTRY_VISIBLE_STATE } from '../domain/public-gallery-entry.policy';
import {
  decodePublicGalleryEntryCursor,
  encodePublicGalleryEntryCursor,
} from '../domain/public-gallery-entry-cursor';
import {
  PublicGalleryEntryListQueryDto,
  PublicGalleryEntrySlugParam,
  PublicGalleryMediaParams,
} from './schemas/public-gallery-entry.request';

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

const FEED = '/api/public/gallery-entries';
const DETAIL = `${FEED}/{slug}`;
const MEDIA = `${DETAIL}/assets/{assetId}/{rendition}`;

const ENTRY_CONTROLLER = readFileSync(
  join(__dirname, 'public-gallery-entry.controller.ts'),
  'utf8',
);
const ASSET_CONTROLLER = readFileSync(
  join(__dirname, 'public-gallery-entry-asset.controller.ts'),
  'utf8',
);
const QUERY_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'public-gallery-entry.query.ts'),
  'utf8',
);
const ENTRY_REPOSITORY_SOURCE = readFileSync(
  join(
    __dirname,
    '..',
    'infrastructure',
    'persistence',
    'drizzle-public-gallery-entry.repository.ts',
  ),
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

/** The domain error code a thrown cursor failure carries, or nothing. */
function thrownCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error ? String(error.code) : undefined;
  }
}

const SLUG = 'bo-suu-tap-hoa-sen';
const ASSET_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

describe('APP11-B03 public gallery contract', () => {
  describe('published surface', () => {
    it('publishes exactly the three operations, with the canonical ids', () => {
      expect(OPENAPI.paths[FEED]?.['get']?.operationId).toBe('publicGalleryEntry_list');
      expect(OPENAPI.paths[DETAIL]?.['get']?.operationId).toBe('publicGalleryEntry_detail');
      expect(OPENAPI.paths[MEDIA]?.['get']?.operationId).toBe('publicGalleryEntry_asset');

      // Each new Path Item Object carries a GET and nothing else: no public
      // write of any kind reaches the gallery.
      expect(Object.keys(OPENAPI.paths[FEED] ?? {}).sort()).toEqual(['get']);
      expect(Object.keys(OPENAPI.paths[DETAIL] ?? {}).sort()).toEqual(['get']);
      expect(Object.keys(OPENAPI.paths[MEDIA] ?? {}).sort()).toEqual(['get']);
    });

    it('mints no publicGalleryEntryAsset family from the controller split', () => {
      const ids = Object.values(OPENAPI.paths).flatMap((item) =>
        Object.values(item).map((operation) => operation.operationId ?? ''),
      );
      expect(ids.filter((id) => id.startsWith('publicGalleryEntry_')).sort()).toEqual([
        'publicGalleryEntry_asset',
        'publicGalleryEntry_detail',
        'publicGalleryEntry_list',
      ]);
      expect(ids.some((id) => id.startsWith('publicGalleryEntryAsset'))).toBe(false);
    });

    it('leaves the gallery surface at exactly ten operations', () => {
      const galleryOperations = Object.entries(OPENAPI.paths)
        .filter(([path]) => path.includes('gallery-entries'))
        .flatMap(([, item]) => Object.values(item));
      expect(galleryOperations).toHaveLength(10);
    });

    it('reaches the generated client', () => {
      for (const name of [
        'publicGalleryEntryList',
        'publicGalleryEntryDetail',
        'publicGalleryEntryAsset',
      ]) {
        expect(CLIENT_SOURCE).toContain(`export const ${name} = (`);
      }
    });
  });

  describe('out of scope', () => {
    it('publishes no robots, content-page or redirect operation', () => {
      for (const path of Object.keys(OPENAPI.paths)) {
        expect(path).not.toMatch(/robots\.txt|content-pages?|redirects?/i);
      }
    });

    it('adds no sitemap operation of its own', () => {
      // `APP11-B04` delivered the one sitemap operation, so the artifact-wide
      // "no sitemap path exists" assertion this checkpoint made is no longer
      // the right question. What B03 still owns is that *its* three routes are
      // the whole gallery surface: none of them is a sitemap, and the one that
      // does exist lives outside `gallery-entries` and is B04's to assert.
      const sitemapPaths = Object.keys(OPENAPI.paths).filter((path) => /sitemap/i.test(path));
      expect(sitemapPaths).toEqual(['/api/public/sitemap-entries']);
      for (const path of sitemapPaths) {
        expect(path).not.toContain('gallery-entries');
      }
    });

    it('adds no migration', () => {
      const migrations = readdirSync(join(REPO_ROOT, 'packages/database/migrations')).filter(
        (file) => file.endsWith('.sql'),
      );
      expect(migrations.length).toBe(37);
    });

    it('introduces no per-image alt text anywhere in the Gallery schema family', () => {
      const gallerySchemas = Object.entries(OPENAPI.components.schemas).filter(([name]) =>
        /Gallery/i.test(name),
      );
      expect(gallerySchemas.length).toBeGreaterThan(0);
      for (const [name, schema] of gallerySchemas) {
        expect(`${name}:${JSON.stringify(schema)}`).not.toMatch(/alt[_ ]?text/i);
      }
    });

    it('applies no guard, session or Origin decorator to either public controller', () => {
      for (const source of [withoutComments(ENTRY_CONTROLLER), withoutComments(ASSET_CONTROLLER)]) {
        expect(source).not.toMatch(/@UseGuards|AuthenticatedAdminGuard|StaffOriginGuard|Cookie/);
      }
    });

    it('never takes a lock or reaches a write port from a public read', () => {
      const read = withoutComments(ENTRY_REPOSITORY_SOURCE) + withoutComments(QUERY_SOURCE);
      expect(read).not.toMatch(/\.for\(|forUpdate|FOR UPDATE|FOR SHARE/i);
      expect(read).not.toMatch(
        // The lookbehind keeps this about the **Admin** authoring port: the
        // public read port's own symbol ends in the same words.
        /GALLERY_ENTRY_PUBLICATION_REPOSITORY|(?<!PUBLIC_)GALLERY_ENTRY_REPOSITORY|changeStatus|attachAsset|replaceAssetLinks|TransactionManager/,
      );
    });
  });

  describe('public visibility', () => {
    it('reads PUBLISHED as the one visible state, from the lifecycle constant', () => {
      expect(PUBLIC_GALLERY_ENTRY_VISIBLE_STATE).toBe('PUBLISHED');
    });

    it('never makes indexability a visibility predicate', () => {
      // A structural claim, not a prose one: the two SQL builders that decide
      // who is *visible* must not compare `isIndexable`. The column is selected
      // and projected there; it is never a WHERE term.
      //
      // Scoped to those two methods since `APP11-B04`, which added
      // `listIndexable` to the same adapter. That read is the SEO inventory and
      // indexability is exactly its point — so the claim this checkpoint owns
      // is that the *browsing* reads still do not filter on it, not that the
      // file never mentions the column in a predicate.
      const sql = withoutComments(ENTRY_REPOSITORY_SOURCE);
      const browsingReads = sql.slice(0, sql.indexOf('async listIndexable'));
      expect(browsingReads).toContain('isIndexable: galleryEntries.isIndexable');
      expect(browsingReads).not.toMatch(/eq\(\s*galleryEntries\.isIndexable/);
      expect(sql).toContain('async listIndexable');
    });

    it('binds the feed to the canonical publication predicate and ordering', () => {
      const sql = withoutComments(ENTRY_REPOSITORY_SOURCE);
      expect(sql).toContain('eq(galleryEntries.status, PUBLIC_GALLERY_ENTRY_VISIBLE_STATE)');
      expect(sql).toContain('orderBy(asc(galleryEntries.displayOrder), asc(galleryEntries.id))');
      // The omission of an entry with no deliverable image is a SQL term, not
      // an application filter that would break the page size.
      expect(sql).toContain('exists (select 1');
    });
  });

  describe('media policy', () => {
    it('reuses the catalog rendition vocabulary rather than coining one', () => {
      expect(PUBLIC_GALLERY_MEDIA_RENDITIONS).toBe(PUBLIC_PRODUCT_MEDIA_RENDITIONS);
      expect([...PUBLIC_GALLERY_MEDIA_RENDITIONS]).toEqual(['thumbnail', 'catalog-preview']);
      expect(resolveDerivativeKind(PUBLIC_GALLERY_LIST_RENDITION)).toBe('THUMBNAIL');
      expect(resolveDerivativeKind(PUBLIC_GALLERY_DETAIL_RENDITION)).toBe('CATALOG_PREVIEW');
    });

    it('treats DELETION_PENDING as withdrawn, with REJECTED and DELETED', () => {
      expect([...PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES].sort()).toEqual([
        'DELETED',
        'DELETION_PENDING',
        'REJECTED',
      ]);
    });

    it('never caches a public gallery response', () => {
      expect(PUBLIC_MEDIA_CACHE_CONTROL).toBe('no-store');
    });

    it('composes a relative address carrying no host, bucket, key or signature', () => {
      const path = publicGalleryMediaPath({
        slug: SLUG,
        assetId: ASSET_ID,
        rendition: PUBLIC_GALLERY_LIST_RENDITION,
      });
      expect(path).toBe(`/api/public/gallery-entries/${SLUG}/assets/${ASSET_ID}/thumbnail`);
      expect(path).not.toMatch(/https?:|X-Amz|signature|expires|bucket/i);
    });
  });

  describe('response contract', () => {
    const publicGallerySchemas = () =>
      Object.entries(OPENAPI.components.schemas).filter(([name]) =>
        name.startsWith('PublicGallery'),
      );

    it('documents the public gallery payloads', () => {
      expect(publicGallerySchemas().length).toBeGreaterThan(0);
    });

    it('exposes no storage, classification, lifecycle or concurrency fact', () => {
      for (const [name, schema] of publicGallerySchemas()) {
        const body = `${name}:${JSON.stringify(schema)}`;
        expect(body).not.toMatch(
          /storageKey|storage_key|bucket|checksum|classification|archivedAt|updatedAt|createdAt|linkedProductId/i,
        );
      }
    });
  });

  describe('list query DTO', () => {
    const schema = () => schemaOf(PublicGalleryEntryListQueryDto);

    it('accepts only cursor and limit', () => {
      expect(schema().safeParse({}).success).toBe(true);
      expect(schema().safeParse({ limit: 10, cursor: 'abc' }).success).toBe(true);
    });

    it.each([
      'status',
      'q',
      'search',
      'category',
      'style',
      'need',
      'offset',
      'page',
      'isIndexable',
    ])('refuses the unknown query parameter %s', (key) => {
      expect(schema().safeParse({ [key]: 'DRAFT' }).success).toBe(false);
    });

    it('bounds the page size', () => {
      expect(schema().safeParse({ limit: 0 }).success).toBe(false);
      expect(schema().safeParse({ limit: 101 }).success).toBe(false);
      expect(schema().safeParse({ limit: 100 }).success).toBe(true);
    });
  });

  describe('path DTOs', () => {
    it('accepts only the canonical slug grammar', () => {
      const schema = schemaOf(PublicGalleryEntrySlugParam);
      expect(schema.safeParse({ slug: SLUG }).success).toBe(true);
      for (const slug of ['Bo-Suu-Tap', 'bo--suu', '-bo', 'bo_suu', 'bo suu', '']) {
        expect(schema.safeParse({ slug }).success).toBe(false);
      }
    });

    it('accepts only a UUID asset id and a known rendition', () => {
      const schema = schemaOf(PublicGalleryMediaParams);
      expect(
        schema.safeParse({ slug: SLUG, assetId: ASSET_ID, rendition: 'thumbnail' }).success,
      ).toBe(true);
      expect(
        schema.safeParse({ slug: SLUG, assetId: ASSET_ID, rendition: 'catalog-preview' }).success,
      ).toBe(true);
      for (const rendition of ['original', 'normalized', 'preview-watermarked', 'full', 'source']) {
        expect(schema.safeParse({ slug: SLUG, assetId: ASSET_ID, rendition }).success).toBe(false);
      }
      expect(
        schema.safeParse({ slug: SLUG, assetId: 'not-a-uuid', rendition: 'thumbnail' }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ slug: SLUG, assetId: ASSET_ID, rendition: 'thumbnail', extra: 1 })
          .success,
      ).toBe(false);
    });
  });

  describe('cursor', () => {
    it('round-trips a position', () => {
      const encoded = encodePublicGalleryEntryCursor({ displayOrder: 42, id: ASSET_ID });
      expect(decodePublicGalleryEntryCursor(encoded)).toEqual({ displayOrder: 42, id: ASSET_ID });
    });

    it.each(['', 'not-base64!!', Buffer.from('{}').toString('base64url')])(
      'refuses a malformed cursor with one undifferentiated code',
      (encoded) => {
        expect(thrownCode(() => decodePublicGalleryEntryCursor(encoded))).toBe(
          'PUBLIC_GALLERY_ENTRY_CURSOR_INVALID',
        );
      },
    );

    it('refuses a non-integer sort value', () => {
      const encoded = Buffer.from(JSON.stringify(['1.5', ASSET_ID])).toString('base64url');
      expect(thrownCode(() => decodePublicGalleryEntryCursor(encoded))).toBe(
        'PUBLIC_GALLERY_ENTRY_CURSOR_INVALID',
      );
    });
  });
});

/**
 * `APP11-B03A` over HTTP — gallery media preparation, operability and the
 * end-to-end proof that closes `FU-APP11-B03-01`.
 *
 * The whole stack runs against a disposable PostgreSQL and a disposable MinIO:
 * the Zod pipe, the response envelope, the exception filter, the real staff
 * guards, the real eligibility predicate, a real provider-side object copy and
 * the real object stream. Asserted here and nowhere else is what no schema
 * check can see:
 *
 * - the source survives promotion completely — id, lane, status, objects,
 *   derivatives and a *published product still delivering from it*;
 * - the derived asset owns its own objects, so neither lifecycle can delete
 *   bytes the other serves;
 * - both renditions are `READY` before the call returns, not eventually;
 * - a failure after the first object was copied leaves the bucket exactly as it
 *   found it;
 * - and the compatibility chain — prepare, attach, publish, read, stream —
 *   runs end to end **without a single insert into `assets`** on the gallery
 *   side.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import { asAdmin, seedPublishableProduct } from '../support/product-publication-fixtures';
import { loginAsOperator } from '../support/gallery-lifecycle-fixture';
import { galleryAuthoring, publicGalleryReader } from '../support/gallery-public-fixture';
import {
  ORIGINAL_BYTES,
  PREPARATION_FIXTURE_EMAIL,
  PREPARATION_FIXTURE_PASSWORD,
  PREVIEW_BYTES,
  THUMBNAIL_BYTES,
  assetRow,
  derivativeRows,
  errorOf,
  galleryAssetCount,
  originalKey,
  preparationClient,
  seedCatalogSource,
  type CatalogSource,
} from '../support/gallery-asset-preparation-fixture';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';

describe('Admin gallery asset preparation (integration)', () => {
  let ctx: PublicMediaTestContext;
  let previousOrigins: string | undefined;
  let client: ReturnType<typeof preparationClient>;
  let authoring: ReturnType<typeof galleryAuthoring>;
  let anon: ReturnType<typeof publicGalleryReader>;
  let publication: ProductPublicationService;
  let adminId: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createPublicMediaContext('app11b03a-gallery-assets');
    await ctx.api.app.get(BootstrapStaffUseCase).bootstrap({
      email: PREPARATION_FIXTURE_EMAIL,
      password: PREPARATION_FIXTURE_PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.api.app.get(LoginRateLimiter).reset();
    const cookie = await loginAsOperator(
      ctx.api.http,
      ADMIN_ORIGIN,
      PREPARATION_FIXTURE_EMAIL,
      PREPARATION_FIXTURE_PASSWORD,
    );
    client = preparationClient(ctx.api, cookie, ADMIN_ORIGIN);
    authoring = galleryAuthoring(ctx.api, cookie, ADMIN_ORIGIN);
    anon = publicGalleryReader(ctx.api);
    publication = ctx.api.app.get(ProductPublicationService);
    // Reused, never seeded: `uq_admin_accounts__status__active` permits exactly
    // one ACTIVE account, and the operator bootstrapped above is it.
    adminId = await anon.bootstrappedAdminId();
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 300_000);

  /** A seeded catalog source, read back through the delivered Admin detail route. */
  const source = async (
    options?: Parameters<typeof seedCatalogSource>[1],
  ): Promise<CatalogSource> => client.source(await seedCatalogSource(ctx, options));

  /** Every object currently under the two APP2-owned prefixes. */
  async function storedKeys(): Promise<{ originals: number; derivatives: number }> {
    const [originals, derivatives] = await Promise.all([
      ctx.storage.listObjectsByPrefix({ bucket: 'ORIGINALS', prefix: 'development/originals/' }),
      ctx.storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix: 'development/derivatives/',
      }),
    ]);
    return { originals: originals.length, derivatives: derivatives.length };
  }

  describe('preparation succeeds and leaves the source alone', () => {
    it('mints a distinct PUBLIC gallery asset without touching the source', async () => {
      const from = await source();

      const prepared = await client.prepare(from);

      expect(prepared.assetId).not.toBe(from.assetId);
      expect(prepared.kind).toBe('GALLERY_MEDIA');
      expect(prepared.classification).toBe('PUBLIC');
      expect(prepared.status).toBe('ACCEPTED');

      const before = await assetRow(ctx.api, from.assetId);
      expect(before.id).toBe(from.assetId);
      expect(before.kind).toBe('CATALOG_MEDIA');
      expect(before.classification).toBe('PRODUCTION_SENSITIVE');
      expect(before.status).toBe('ACCEPTED');
      expect(before.deleted_at).toBeNull();
      expect(before.storage_key).toBe(originalKey(from.assetId));
    });

    it('carries the source facts onto the copy without re-measuring them', async () => {
      const from = await source();
      const original = await assetRow(ctx.api, from.assetId);

      const prepared = await client.prepare(from);
      const copy = await assetRow(ctx.api, prepared.assetId);

      expect(prepared.mediaType).toBe('image/png');
      expect(prepared.checksum).toBe(`sha256:${'e'.repeat(64)}`);
      // The one fact that must *not* be carried across.
      expect(copy.storage_key).not.toBe(original.storage_key);
    });

    it('gives the copy independent object keys in both buckets', async () => {
      const from = await source();

      const prepared = await client.prepare(from);

      const derived = await derivativeRows(ctx.api, prepared.assetId);
      const sourceDerivatives = await derivativeRows(ctx.api, from.assetId);
      const derivedKeys = derived.map((row) => row.storage_key);
      for (const row of sourceDerivatives) {
        expect(derivedKeys).not.toContain(row.storage_key);
      }
      // Every derived key is namespaced by the derived asset's own id, so
      // tombstoning either asset can never reach the other's bytes.
      for (const key of derivedKeys) {
        expect(key).toContain(prepared.assetId);
        expect(key).not.toContain(from.assetId);
      }
    });

    it('has both renditions READY before the response, not eventually', async () => {
      const prepared = await client.preparedFrom(ctx);

      const rows = await derivativeRows(ctx.api, prepared.assetId);

      expect(rows.map((row) => row.kind)).toEqual(['CATALOG_PREVIEW', 'THUMBNAIL']);
      expect(rows.every((row) => row.status === 'READY')).toBe(true);
      expect(rows.every((row) => row.storage_key !== null)).toBe(true);
      expect(prepared.renditions.map((entry) => entry.rendition).sort()).toEqual([
        'catalog-preview',
        'thumbnail',
      ]);
    });

    it('copies the real bytes, per rendition', async () => {
      const prepared = await client.preparedFrom(ctx);

      const thumbnail = await client.preview(prepared.assetId, 'thumbnail').expect(200);
      const preview = await client.preview(prepared.assetId, 'catalog-preview').expect(200);

      expect(Buffer.from(thumbnail.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(true);
      expect(Buffer.from(preview.body as Buffer).equals(PREVIEW_BYTES)).toBe(true);
      // Proves the rendition selected the derivative, not merely the asset.
      expect(Buffer.from(preview.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(false);
    });

    it('copies the original too, so the row never points at a missing object', async () => {
      const prepared = await client.preparedFrom(ctx);
      const copy = await assetRow(ctx.api, prepared.assetId);

      const stored = await ctx.storage.getObjectStream({
        bucket: 'ORIGINALS',
        key: copy.storage_key,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of stored.body) {
        chunks.push(chunk as Buffer);
      }
      expect(Buffer.concat(chunks).equals(ORIGINAL_BYTES)).toBe(true);
    });

    it('prepares a second, independent asset when asked twice', async () => {
      const from = await source();

      const first = await client.prepare(from);
      const second = await client.prepare(await client.source(from.assetId));

      expect(second.assetId).not.toBe(first.assetId);
      expect((await assetRow(ctx.api, from.assetId)).status).toBe('ACCEPTED');
    });
  });

  describe('source eligibility', () => {
    async function refused(body: Record<string, unknown>, status: number, code: string) {
      const before = await galleryAssetCount(ctx.api);
      const res = await client.attempt(body);
      expect(res.status).toBe(status);
      expect(errorOf(res).code).toBe(code);
      expect(await galleryAssetCount(ctx.api)).toBe(before);
    }

    const token = new Date().toISOString();

    it('refuses an unknown source', async () => {
      await refused(
        { sourceAssetId: newId(), expectedSourceUpdatedAt: token },
        404,
        'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
      );
    });

    it.each([
      ['CUSTOMER_PRIVATE', { kind: 'CUSTOMER_UPLOAD', classification: 'CUSTOMER_PRIVATE' }],
      ['already PUBLIC', { kind: 'GALLERY_MEDIA', classification: 'PUBLIC' }],
    ])('refuses a %s source, identically to an unknown one', async (_label, lane) => {
      const assetId = await seedCatalogSource(ctx, lane);
      await refused(
        { sourceAssetId: assetId, expectedSourceUpdatedAt: token },
        404,
        'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
      );
    });

    it.each(['UPLOADED', 'INSPECTING', 'REJECTED', 'DELETION_PENDING', 'DELETED'])(
      'refuses a %s source',
      async (status) => {
        const assetId = await seedCatalogSource(ctx, { status });
        await refused(
          { sourceAssetId: assetId, expectedSourceUpdatedAt: token },
          404,
          'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
        );
      },
    );

    it('refuses a tombstoned source even if its status still reads ACCEPTED', async () => {
      const assetId = await seedCatalogSource(ctx, { deleted: true });
      await refused(
        { sourceAssetId: assetId, expectedSourceUpdatedAt: token },
        404,
        'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
      );
    });

    it.each([
      ['a missing rendition', { readyDerivatives: ['THUMBNAIL'] }],
      [
        'an unready rendition',
        { readyDerivatives: ['THUMBNAIL'], pendingDerivatives: ['CATALOG_PREVIEW'] },
      ],
      ['no rendition at all', { readyDerivatives: [] }],
    ])('refuses a source with %s', async (_label, options) => {
      // The *real* token here, unlike the cases above: the lane and status
      // checks run first, so a fabricated one would refuse as a version
      // conflict and this case would never reach the rendition rule at all.
      const from = await client.source(await seedCatalogSource(ctx, options));
      await refused(
        { sourceAssetId: from.assetId, expectedSourceUpdatedAt: from.updatedAt },
        404,
        'GALLERY_ASSET_SOURCE_NOT_ELIGIBLE',
      );
    });

    it('refuses a stale version token and creates nothing', async () => {
      const from = await source();
      const stale = new Date(Date.parse(from.updatedAt) - 1_000).toISOString();

      await refused(
        { sourceAssetId: from.assetId, expectedSourceUpdatedAt: stale },
        409,
        'GALLERY_ASSET_SOURCE_VERSION_CONFLICT',
      );
    });

    it('refuses without a token at all', async () => {
      const from = await source();
      const res = await client.attempt({ sourceAssetId: from.assetId });
      expect(res.status).toBe(400);
    });
  });

  describe('failure leaves nothing behind', () => {
    it('answers 503 and removes the object it had already copied', async () => {
      // Rows and the original object exist; neither derivative object does. The
      // original therefore copies successfully and the first derivative copy
      // fails — a failure strictly *after* an object was created, which is the
      // only shape in which compensation is observable.
      const assetId = await seedCatalogSource(ctx, { storeObjects: false });
      await ctx.storage.putObjectStream({
        bucket: 'ORIGINALS',
        key: originalKey(assetId),
        body: (await import('node:stream')).Readable.from([ORIGINAL_BYTES]),
        contentType: 'image/png',
        contentLengthBytes: ORIGINAL_BYTES.byteLength,
      });
      const from = await client.source(assetId);
      const before = await storedKeys();
      const assetsBefore = await galleryAssetCount(ctx.api);

      const res = await client.attempt({
        sourceAssetId: from.assetId,
        expectedSourceUpdatedAt: from.updatedAt,
      });

      expect(res.status).toBe(503);
      expect(await storedKeys()).toEqual(before);
      expect(await galleryAssetCount(ctx.api)).toBe(assetsBefore);
    });

    it('leaves no half-created asset when the source objects are gone entirely', async () => {
      const from = await client.source(await seedCatalogSource(ctx, { storeObjects: false }));
      const before = await storedKeys();

      const res = await client.attempt({
        sourceAssetId: from.assetId,
        expectedSourceUpdatedAt: from.updatedAt,
      });

      expect(res.status).toBe(503);
      expect(await storedKeys()).toEqual(before);
    });
  });

  describe('product non-regression', () => {
    it('keeps a published product delivering from a source that was promoted', async () => {
      const assetId = await seedCatalogSource(ctx);
      const seeded = await seedPublishableProduct(ctx.api, { mediaAssetIds: [assetId] });
      const published = await asAdmin(ctx.api, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );
      const media = (
        await ctx.api.database.client.db.execute(
          sql`select id, asset_id from product_media where product_id = ${seeded.productId}`,
        )
      ).rows as { id: string; asset_id: string }[];

      const prepared = await client.prepare(await client.source(assetId));

      // The association is untouched: same rows, same asset.
      const after = (
        await ctx.api.database.client.db.execute(
          sql`select id, asset_id from product_media where product_id = ${seeded.productId}`,
        )
      ).rows as { id: string; asset_id: string }[];
      expect(after).toEqual(media);
      expect(after.every((row) => row.asset_id === assetId)).toBe(true);
      expect(after.some((row) => row.asset_id === prepared.assetId)).toBe(false);

      // And the public product-media route still serves the source's bytes.
      const mediaId = (media[0] as { id: string }).id;
      const response = await ctx.api.http
        .get(`/api/public/products/${published.slug}/media/${mediaId}/thumbnail`)
        .responseType('blob')
        .expect(200);
      expect(Buffer.from(response.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(true);
    });
  });

  describe('admin operability', () => {
    it('lists the prepared asset under the gallery scope, and only there', async () => {
      const prepared = await client.preparedFrom(ctx);

      const gallery = await client.list('?scope=GALLERY&limit=100').expect(200);
      const ids = (gallery.body as { data: { items: { assetId: string }[] } }).data.items.map(
        (item) => item.assetId,
      );
      expect(ids).toContain(prepared.assetId);

      const catalog = await client.list('?limit=100').expect(200);
      const catalogIds = (
        catalog.body as { data: { items: { assetId: string }[] } }
      ).data.items.map((item) => item.assetId);
      expect(catalogIds).not.toContain(prepared.assetId);
    });

    it('leaves the default list exactly the catalog lane it always was', async () => {
      await client.preparedFrom(ctx);

      const res = await client.list('?limit=100').expect(200);
      const items = (res.body as { data: { items: { kind: string; classification: string }[] } })
        .data.items;

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.kind === 'CATALOG_MEDIA')).toBe(true);
      expect(items.every((item) => item.classification === 'PRODUCTION_SENSITIVE')).toBe(true);
    });

    it('reads one prepared asset by id under the gallery scope', async () => {
      const prepared = await client.preparedFrom(ctx);

      const found = await client.detail(prepared.assetId, 'GALLERY').expect(200);
      expect((found.body as { data: { assetId: string } }).data.assetId).toBe(prepared.assetId);

      // The default scope cannot see it, and says so identically to absent.
      const missed = await client.detail(prepared.assetId).expect(404);
      expect(errorOf(missed).code).toBe('ASSET_NOT_FOUND');
    });

    it('never exposes a catalog or private asset through the gallery scope', async () => {
      const catalogId = await seedCatalogSource(ctx);
      const privateId = await seedCatalogSource(ctx, {
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
      });

      for (const assetId of [catalogId, privateId]) {
        await client.detail(assetId, 'GALLERY').expect(404);
      }
      const res = await client.list('?scope=GALLERY&limit=100').expect(200);
      const ids = (res.body as { data: { items: { assetId: string }[] } }).data.items.map(
        (item) => item.assetId,
      );
      expect(ids).not.toContain(catalogId);
      expect(ids).not.toContain(privateId);
    });

    it('refuses an unknown scope rather than falling back to a lane', async () => {
      await client.list('?scope=EVERYTHING').expect(400);
    });

    it('previews only the gallery lane, and only the two public renditions', async () => {
      const catalogId = await seedCatalogSource(ctx);

      await client.preview(catalogId, 'thumbnail').expect(404);
      await client.preview(newId(), 'thumbnail').expect(404);
      await client.preview((await client.preparedFrom(ctx)).assetId, 'NORMALIZED').expect(400);
    });

    it('sets the safe transport headers on a preview', async () => {
      const prepared = await client.preparedFrom(ctx);

      const res = await client.preview(prepared.assetId, 'thumbnail').expect(200);

      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(JSON.stringify(res.headers)).not.toContain('development/derivatives');
    });

    it('is Admin-only: an anonymous caller reaches neither operation', async () => {
      const prepared = await client.preparedFrom(ctx);

      await ctx.api.http.get(`/api/admin/gallery-assets/${prepared.assetId}/thumbnail`).expect(401);
      await ctx.api.http
        .post('/api/admin/gallery-assets')
        .set('Origin', ADMIN_ORIGIN)
        .send({ sourceAssetId: newId(), expectedSourceUpdatedAt: new Date().toISOString() })
        .expect(401);
    });
  });

  describe('APP11 compatibility, with no seeded gallery asset', () => {
    it('runs prepare → attach → publish → public feed → detail → bytes', async () => {
      await anon.clearGallery();

      // 1-3. The only way a gallery-public asset comes into existence.
      const prepared = await client.preparedFrom(ctx);

      // 4-5. `APP11-B02`, through the delivered Admin API.
      const entry = await authoring.published([prepared.assetId]);

      // 6. `APP11-B03` feed and detail, anonymously.
      const feed = await anon.feed();
      const listed = feed.items.find((item) => item.slug === entry.slug);
      expect(listed).toBeDefined();
      expect(listed?.coverAssetId).toBe(prepared.assetId);
      expect(listed?.assetCount).toBe(1);

      const detail = await anon.detail(entry.slug);
      expect(detail.assets.map((asset) => asset.assetId)).toEqual([prepared.assetId]);

      // 7. The bytes, from the public route.
      const url = detail.assets[0]?.url as string;
      const streamed = await ctx.api.http.get(url).responseType('blob').expect(200);
      expect(Buffer.from(streamed.body as Buffer).equals(PREVIEW_BYTES)).toBe(true);

      const card = await ctx.api.http
        .get(listed?.coverUrl as string)
        .responseType('blob')
        .expect(200);
      expect(Buffer.from(card.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(true);
    });

    it('leaves the asset untouched when the entry is unpublished or detached', async () => {
      await anon.clearGallery();
      const prepared = await client.preparedFrom(ctx);
      const entry = await authoring.published([prepared.assetId]);

      const unpublished = await authoring.unpublish(entry);
      await authoring.attach(unpublished, []);

      const row = await assetRow(ctx.api, prepared.assetId);
      expect(row.status).toBe('ACCEPTED');
      expect(row.classification).toBe('PUBLIC');
      expect(row.deleted_at).toBeNull();
      expect(
        (await derivativeRows(ctx.api, prepared.assetId)).every((d) => d.status === 'READY'),
      ).toBe(true);
      // Still selectable and previewable, so an operator can reuse it.
      await client.detail(prepared.assetId, 'GALLERY').expect(200);
      await client.preview(prepared.assetId, 'thumbnail').expect(200);
    });

    it('keeps an unattached prepared asset unreachable from the public surface', async () => {
      await anon.clearGallery();
      const prepared = await client.preparedFrom(ctx);

      expect((await anon.feed()).items).toHaveLength(0);
      // There is no public address for an asset that no published entry shows.
      await ctx.api.http.get(`/api/public/gallery-entries/${prepared.assetId}`).expect(404);
    });
  });
});

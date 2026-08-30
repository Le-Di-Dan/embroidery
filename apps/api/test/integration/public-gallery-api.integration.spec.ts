/**
 * `APP11-B03` over HTTP — the public gallery feed, detail and image delivery.
 *
 * The whole stack runs against a disposable PostgreSQL and a disposable MinIO:
 * the Zod pipe, the response envelope, the exception filter, the real
 * publication predicate, the real eligibility predicate and the real object
 * stream. Asserted here and nowhere else is what no schema check can see — that
 * a draft and an archived entry are indistinguishable from absent, that a
 * `noindex` entry is still public, that an image withdrawn after publication
 * disappears from both the projection and the bytes without anyone editing the
 * curator's selection, that a non-public linked product is hidden without
 * hiding the entry, and that the anonymous surface never touches a cookie.
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
import {
  GALLERY_FIXTURE_EMAIL,
  GALLERY_FIXTURE_PASSWORD,
  loginAsOperator,
} from '../support/gallery-lifecycle-fixture';
import {
  DETAIL_KIND,
  LIST_KIND,
  PUBLIC_GALLERY_PATH,
  bodyText,
  derivativeKey,
  errorOf,
  galleryAuthoring,
  linkProduct,
  publicGalleryDetailUrl,
  publicGalleryMediaUrl,
  publicGalleryReader,
  seedDeliverableAsset,
  setAssetStatus,
  tombstoneAsset,
} from '../support/gallery-public-fixture';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';

describe('Public gallery reads & media delivery (integration)', () => {
  let ctx: PublicMediaTestContext;
  let previousOrigins: string | undefined;
  let authoring: ReturnType<typeof galleryAuthoring>;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createPublicMediaContext('app11b03-public-gallery');
    await ctx.api.app.get(BootstrapStaffUseCase).bootstrap({
      email: GALLERY_FIXTURE_EMAIL,
      password: GALLERY_FIXTURE_PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.api.app.get(LoginRateLimiter).reset();
    const cookie = await loginAsOperator(ctx.api.http, ADMIN_ORIGIN);
    authoring = galleryAuthoring(ctx.api, cookie, ADMIN_ORIGIN);
    anon = publicGalleryReader(ctx.api);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 300_000);

  /** Every public call here is anonymous: no cookie, no Origin, no header. */
  let anon: ReturnType<typeof publicGalleryReader>;

  const seedAsset = (options?: Parameters<typeof seedDeliverableAsset>[2]) =>
    seedDeliverableAsset(ctx.api, ctx.storage, options);
  const feed = (query?: string) => anon.feed(query);
  const detail = (slug: string) => anon.detail(slug);
  const clearGallery = () => anon.clearGallery();

  describe('feed visibility', () => {
    it('lists published entries only, in display_order then id', async () => {
      await clearGallery();
      const [a, b, c] = await Promise.all([seedAsset(), seedAsset(), seedAsset()]);
      const second = await authoring.published([b], { displayOrder: 20 });
      const first = await authoring.published([a], { displayOrder: 10 });
      // A DRAFT holding a perfectly deliverable image.
      await authoring.attach(await authoring.createEntry({ displayOrder: 5 }), [c]);

      const page = await feed();

      expect(page.items.map((item) => item.slug)).toEqual([first.slug, second.slug]);
      expect(page.hasNext).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('hides an entry the operator unpublishes, on the very next read', async () => {
      await clearGallery();
      const entry = await authoring.published([await seedAsset()]);
      expect((await feed()).items.map((item) => item.slug)).toEqual([entry.slug]);

      await authoring.unpublish(entry);

      expect((await feed()).items).toHaveLength(0);
    });

    it('hides an ARCHIVED entry exactly as it hides a DRAFT', async () => {
      await clearGallery();
      const entry = await authoring.published([await seedAsset()]);
      // No delivered operation archives a gallery entry, so the state is set
      // directly — the public contract must still answer for it.
      await ctx.api.database.client.db.execute(
        sql`update gallery_entries set status = 'ARCHIVED', archived_at = now() where id = ${entry.galleryEntryId}`,
      );

      expect((await feed()).items).toHaveLength(0);
      expect((await anon.get(publicGalleryDetailUrl(entry.slug))).status).toBe(404);
    });

    it('keeps a noindex published entry fully public', async () => {
      await clearGallery();
      const entry = await authoring.published([await seedAsset()], { isIndexable: false });

      const page = await feed();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.isIndexable).toBe(false);

      const view = await detail(entry.slug);
      expect(view.seo.isIndexable).toBe(false);
      const media = await anon.get(view.assets[0]!.url);
      expect(media.status).toBe(200);
    });
  });

  describe('feed projection integrity', () => {
    it('omits a published entry whose every image has been withdrawn', async () => {
      await clearGallery();
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      expect((await feed()).items).toHaveLength(1);

      await tombstoneAsset(ctx.api, assetId);

      expect((await feed()).items).toHaveLength(0);
      // The curated selection is untouched: hiding is a read-time projection
      // rule, never a mutation, and the entry is still PUBLISHED.
      const stored = await ctx.api.database.client.db.execute(
        sql`select status from gallery_entries where id = ${entry.galleryEntryId}`,
      );
      expect((stored.rows[0] as { status: string }).status).toBe('PUBLISHED');
      const links = await ctx.api.database.client.db.execute(
        sql`select asset_id from gallery_entry_assets where gallery_entry_id = ${entry.galleryEntryId}`,
      );
      expect(links.rows).toHaveLength(1);
    });

    it('leads with the first still-deliverable image and counts only those', async () => {
      await clearGallery();
      const [a, b, c] = await Promise.all([seedAsset(), seedAsset(), seedAsset()]);
      const entry = await authoring.published([a, b, c]);
      await tombstoneAsset(ctx.api, a);

      const [card] = (await feed()).items;
      expect(card?.coverAssetId).toBe(b);
      expect(card?.assetCount).toBe(2);
      expect(card?.coverUrl).toBe(publicGalleryMediaUrl(entry.slug, b, 'thumbnail'));
      // The advertised cover really streams — metadata and bytes agree.
      expect((await anon.get(card!.coverUrl)).status).toBe(200);
    });

    it('exposes no storage, classification or lifecycle fact', async () => {
      await clearGallery();
      const assetId = await seedAsset();
      await authoring.published([assetId]);

      const body = JSON.stringify(await feed());
      expect(body).not.toContain(derivativeKey(assetId, LIST_KIND));
      expect(body).not.toMatch(/storage|bucket|checksum|classification|PUBLISHED|DERIVATIVES/i);
    });
  });

  describe('feed pagination', () => {
    it('continues deterministically across a cursor', async () => {
      await clearGallery();
      const assets = await Promise.all([seedAsset(), seedAsset(), seedAsset()]);
      const slugs: string[] = [];
      for (const [index, assetId] of assets.entries()) {
        slugs.push((await authoring.published([assetId], { displayOrder: index + 1 })).slug);
      }

      const firstPage = await feed('?limit=2');
      expect(firstPage.items.map((item) => item.slug)).toEqual(slugs.slice(0, 2));
      expect(firstPage.hasNext).toBe(true);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await feed(`?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`);
      expect(secondPage.items.map((item) => item.slug)).toEqual(slugs.slice(2));
      expect(secondPage.hasNext).toBe(false);
      expect(secondPage.nextCursor).toBeNull();
    });

    it('answers a malformed cursor with a 400 rather than restarting the page', async () => {
      const res = await anon.get(`${PUBLIC_GALLERY_PATH}?cursor=not-a-cursor`);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('PUBLIC_GALLERY_ENTRY_CURSOR_INVALID');
    });

    it('refuses an unknown query parameter', async () => {
      expect((await anon.get(`${PUBLIC_GALLERY_PATH}?status=DRAFT`)).status).toBe(400);
    });
  });

  describe('detail', () => {
    it('publishes the entry, its SEO text and its ordered images', async () => {
      const [a, b] = await Promise.all([seedAsset(), seedAsset()]);
      const entry = await authoring.published([a, b], {
        seoTitle: 'Hoa sen thêu tay',
        seoDescription: 'Mười hai mẫu thêu tay.',
      });

      const view = await detail(entry.slug);

      expect(view.galleryEntryId).toBe(entry.galleryEntryId);
      expect(view.seo).toEqual({
        title: 'Hoa sen thêu tay',
        description: 'Mười hai mẫu thêu tay.',
        isIndexable: true,
      });
      expect(view.assets.map((asset) => asset.assetId)).toEqual([a, b]);
      expect(view.assets.map((asset) => asset.position)).toEqual([0, 1]);
      expect(view.assets[0]?.url).toBe(publicGalleryMediaUrl(entry.slug, a, 'catalog-preview'));
      expect(JSON.stringify(view)).not.toMatch(/alt[_ ]?text/i);
    });

    it('preserves order and renumbers positions after an image is withdrawn', async () => {
      const [a, b, c] = await Promise.all([seedAsset(), seedAsset(), seedAsset()]);
      const entry = await authoring.published([a, b, c]);
      await tombstoneAsset(ctx.api, b);

      const view = await detail(entry.slug);

      expect(view.assets.map((asset) => asset.assetId)).toEqual([a, c]);
      expect(view.assets.map((asset) => asset.position)).toEqual([0, 1]);
      // Nothing the detail advertises would be refused by the binary route.
      for (const asset of view.assets) {
        expect((await anon.get(asset.url)).status).toBe(200);
      }
    });

    it('answers 404 once no image is deliverable', async () => {
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      await tombstoneAsset(ctx.api, assetId);

      const res = await anon.get(publicGalleryDetailUrl(entry.slug));
      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe('PUBLIC_GALLERY_ENTRY_NOT_FOUND');
    });

    it('answers an unknown slug and a draft entry identically', async () => {
      const draft = await authoring.attach(await authoring.createEntry(), [await seedAsset()]);

      const unknown = await anon.get(publicGalleryDetailUrl('khong-ton-tai-o-day'));
      const asDraft = await anon.get(publicGalleryDetailUrl(draft.slug));

      expect(unknown.status).toBe(404);
      expect(asDraft.status).toBe(404);
      expect(errorOf(asDraft).code).toBe(errorOf(unknown).code);
      expect(errorOf(asDraft).message).toBe(errorOf(unknown).message);
    });
  });

  describe('linked product', () => {
    it('summarises a publicly visible product without leaking its internals', async () => {
      const product = await seedPublishableProduct(ctx.api);
      const adminId = await anon.bootstrappedAdminId();
      await asAdmin(ctx.api, adminId, () =>
        ctx.api.app.get(ProductPublicationService).publish({
          productId: product.productId,
          expectedUpdatedAt: new Date(product.updatedAt),
        }),
      );
      const entry = await authoring.published([await seedAsset()]);
      await linkProduct(ctx.api, entry.galleryEntryId, product.productId);

      const view = await detail(entry.slug);

      expect(view.linkedProduct).not.toBeNull();
      expect(view.linkedProduct?.slug).toEqual(expect.any(String));
      expect(view.linkedProduct?.name).toEqual(expect.any(String));
      expect(JSON.stringify(view)).not.toContain(product.productId);
      expect(JSON.stringify(view.linkedProduct)).not.toMatch(/status|price|categoryId|DRAFT/i);
    });

    it('hides a non-public linked product without hiding the gallery entry', async () => {
      // Never published, so it stays DRAFT — Admin-visible, publicly absent.
      const product = await seedPublishableProduct(ctx.api);
      const entry = await authoring.published([await seedAsset()]);
      await linkProduct(ctx.api, entry.galleryEntryId, product.productId);

      const view = await detail(entry.slug);

      expect(view.linkedProduct).toBeNull();
      expect(view.slug).toBe(entry.slug);
      expect(JSON.stringify(view)).not.toContain(product.productId);
    });

    it('reports no link as null, the same shape a hidden product produces', async () => {
      const entry = await authoring.published([await seedAsset()]);
      expect((await detail(entry.slug)).linkedProduct).toBeNull();
    });
  });

  describe('media delivery', () => {
    it('streams an associated eligible image with the canonical headers', async () => {
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);

      const res = await anon.get(publicGalleryMediaUrl(entry.slug, assetId, 'catalog-preview'));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(JSON.stringify(res.headers)).not.toContain(derivativeKey(assetId, DETAIL_KIND));
      expect(bodyText(res)).toBe(`webp:${assetId}:${DETAIL_KIND}`);
    });

    it('serves both renditions from their own derivative', async () => {
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);

      const thumb = await anon.get(publicGalleryMediaUrl(entry.slug, assetId, 'thumbnail'));
      expect(thumb.status).toBe(200);
      expect(bodyText(thumb)).toBe(`webp:${assetId}:${LIST_KIND}`);
    });

    it('refuses delivery for a draft, an unpublished and an unknown entry alike', async () => {
      const assetId = await seedAsset();
      const draft = await authoring.attach(await authoring.createEntry(), [assetId]);
      const draftRes = await anon.get(publicGalleryMediaUrl(draft.slug, assetId, 'thumbnail'));

      const other = await seedAsset();
      const published = await authoring.published([other]);
      await authoring.unpublish(published);
      const unpublishedRes = await anon.get(
        publicGalleryMediaUrl(published.slug, other, 'thumbnail'),
      );

      const unknownRes = await anon.get(
        publicGalleryMediaUrl('khong-ton-tai-o-day', other, 'thumbnail'),
      );

      for (const res of [draftRes, unpublishedRes, unknownRes]) {
        expect(res.status).toBe(404);
        expect(errorOf(res).code).toBe('PUBLIC_GALLERY_MEDIA_NOT_FOUND');
      }
      expect(errorOf(draftRes).message).toBe(errorOf(unknownRes).message);
    });

    it('refuses an asset that belongs to a different published entry', async () => {
      const [mine, theirs] = await Promise.all([seedAsset(), seedAsset()]);
      const entry = await authoring.published([mine]);
      await authoring.published([theirs]);

      const res = await anon.get(publicGalleryMediaUrl(entry.slug, theirs, 'thumbnail'));
      expect(res.status).toBe(404);
    });

    it('refuses an unknown asset id', async () => {
      const entry = await authoring.published([await seedAsset()]);
      const res = await anon.get(publicGalleryMediaUrl(entry.slug, newId(), 'thumbnail'));
      expect(res.status).toBe(404);
    });

    it.each(['CUSTOMER_PRIVATE', 'PRODUCTION_SENSITIVE'] as const)(
      'refuses a %s asset even when the association exists',
      async (classification) => {
        // The Admin surface refuses to attach these, so the association is
        // written directly: the delivery route must refuse them on its own
        // authority, not because an earlier write happened to be careful.
        const assetId = await seedAsset({ classification });
        const entry = await authoring.published([await seedAsset()]);
        await ctx.api.database.client.db.execute(sql`
          insert into gallery_entry_assets (id, gallery_entry_id, asset_id, display_order)
          values (${newId()}, ${entry.galleryEntryId}, ${assetId}, 9)
        `);

        const res = await anon.get(publicGalleryMediaUrl(entry.slug, assetId, 'thumbnail'));
        expect(res.status).toBe(404);
        // And it never appears in the metadata either.
        expect((await detail(entry.slug)).assets.map((a) => a.assetId)).not.toContain(assetId);
      },
    );

    it.each(['REJECTED', 'DELETION_PENDING', 'DELETED'] as const)(
      'refuses an asset in the withdrawn state %s',
      async (status) => {
        const assetId = await seedAsset();
        const keeper = await seedAsset();
        const entry = await authoring.published([assetId, keeper]);
        expect(
          (await anon.get(publicGalleryMediaUrl(entry.slug, assetId, 'thumbnail'))).status,
        ).toBe(200);

        await setAssetStatus(ctx.api, assetId, status);

        expect(
          (await anon.get(publicGalleryMediaUrl(entry.slug, assetId, 'thumbnail'))).status,
        ).toBe(404);
        expect((await detail(entry.slug)).assets.map((a) => a.assetId)).toEqual([keeper]);
      },
    );

    it('refuses an unready, watermarked or missing derivative', async () => {
      const pending = await seedAsset({ derivativeStatus: 'PENDING' });
      // Watermarked on the THUMBNAIL kind: `ck_asset_derivatives__watermark_by_kind`
      // already forbids a watermarked CATALOG_PREVIEW physically, so INV-22 can
      // only be tested at the delivery boundary on the kind the database still
      // allows to carry the flag.
      const watermarked = await seedAsset({ derivatives: [LIST_KIND], isWatermarked: true });
      const listOnly = await seedAsset({ derivatives: [LIST_KIND] });
      const entry = await authoring.published([pending, watermarked, listOnly]);

      expect(
        (await anon.get(publicGalleryMediaUrl(entry.slug, pending, 'catalog-preview'))).status,
      ).toBe(404);
      expect(
        (await anon.get(publicGalleryMediaUrl(entry.slug, watermarked, 'thumbnail'))).status,
      ).toBe(404);
      // The one with only a THUMBNAIL streams that rendition and refuses the
      // other — the rendition is resolved per request, never assumed.
      expect(
        (await anon.get(publicGalleryMediaUrl(entry.slug, listOnly, 'thumbnail'))).status,
      ).toBe(200);
      expect(
        (await anon.get(publicGalleryMediaUrl(entry.slug, listOnly, 'catalog-preview'))).status,
      ).toBe(404);
    });

    it('refuses an unsupported rendition at the boundary', async () => {
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      for (const rendition of ['original', 'normalized', 'preview-watermarked']) {
        const res = await anon.get(publicGalleryMediaUrl(entry.slug, assetId, rendition));
        expect(res.status).toBe(400);
      }
    });
  });

  describe('scope safety', () => {
    it('serves every public read anonymously, with no cookie set on the response', async () => {
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);

      for (const path of [
        PUBLIC_GALLERY_PATH,
        publicGalleryDetailUrl(entry.slug),
        publicGalleryMediaUrl(entry.slug, assetId, 'thumbnail'),
      ]) {
        const res = await anon.get(path);
        expect(res.status).toBe(200);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('exposes no mutation on the public gallery base path', async () => {
      const entry = await authoring.published([await seedAsset()]);
      for (const res of await Promise.all([
        ctx.api.http.post(PUBLIC_GALLERY_PATH).send({}),
        ctx.api.http.put(publicGalleryDetailUrl(entry.slug)).send({}),
        ctx.api.http.delete(publicGalleryDetailUrl(entry.slug)),
        ctx.api.http.patch(publicGalleryDetailUrl(entry.slug)).send({}),
      ])) {
        expect(res.status).toBe(404);
      }
    });

    it('publishes no sitemap operation', async () => {
      expect((await anon.get('/api/public/sitemap')).status).toBe(404);
    });
  });
});

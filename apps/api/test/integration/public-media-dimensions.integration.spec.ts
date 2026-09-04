/**
 * `APP12-H05-C1` — the published intrinsic dimensions belong to the derivative
 * the published URL addresses.
 *
 * ## Why this needs a database
 *
 * The property under test is a property of SQL, not of a mapper. The Product
 * list resolves its thumbnail through a correlated subquery and the Product
 * detail through an INNER JOIN; the Gallery feed and Gallery detail do the same
 * two things again. A double would prove the projection copies whatever it was
 * handed. Only real PostgreSQL proves the *right row* was handed to it.
 *
 * ## What makes the claim falsifiable
 *
 * Every asset below carries **deliberately different sizes on its two
 * derivatives** — `THUMBNAIL` 800×1000 and `CATALOG_PREVIEW` 1600×2000. The list
 * surfaces address the `thumbnail` rendition and the detail surfaces address
 * `catalog-preview`, so reading the wrong derivative does not produce a subtly
 * wrong number: it produces the *other* pair, and the assertion fails loudly. A
 * fixture with one size everywhere would pass against a completely broken join.
 *
 * The ratio is 4:5 rather than 1:1, so a square-assuming fallback anywhere in
 * the chain would be visible rather than accidentally correct.
 *
 * ## The absence case is a first-class case
 *
 * `ck_asset_derivatives__metadata_all_or_none` lets a historical derivative
 * carry no dimensions at all, and every pre-existing fixture in this repository
 * seeds exactly that. Those rows must stay deliverable and must publish **no**
 * size rather than a guessed one — asserted here as its own behaviour, not
 * inferred from the sized case.
 */
import { sql } from 'drizzle-orm';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { PublicProductQuery } from '../../src/modules/catalog/application/public-product.query';
import { PublicGalleryEntryQuery } from '../../src/modules/gallery/application/public-gallery-entry.query';
import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import { createPublicMediaContext } from '../support/public-media-context';
import type { PublicMediaTestContext } from '../support/public-media-context';
import {
  GALLERY_FIXTURE_EMAIL,
  GALLERY_FIXTURE_PASSWORD,
  loginAsOperator,
} from '../support/gallery-lifecycle-fixture';
import {
  galleryAuthoring,
  publicGalleryReader,
  seedDeliverableAsset,
} from '../support/gallery-public-fixture';
import {
  asAdmin,
  seedAsset,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(300_000);

const ADMIN_ORIGIN = 'http://admin.localhost';

/** Two sizes, neither square and neither equal to the other. */
const THUMBNAIL_SIZE = { width: 800, height: 1000 } as const;
const PREVIEW_SIZE = { width: 1600, height: 2000 } as const;
const SIZED = { THUMBNAIL: THUMBNAIL_SIZE, CATALOG_PREVIEW: PREVIEW_SIZE } as const;

/** Every private locator shape that must never reach a public payload. */
const PRIVATE_LOCATOR_PATTERNS = [
  /development\/derivatives\//,
  /development\/originals\//,
  /storageKey/i,
  /storage_key/i,
  /bucket/i,
  /checksum/i,
  /sha256:/,
];

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...stringsIn(inner)]);
  }
  return [];
}

describe('APP12-H05-C1 public media intrinsic dimensions (integration)', () => {
  let ctx: PublicMediaTestContext;
  let previousOrigins: string | undefined;
  let adminId: string;
  let catalog: PublicProductQuery;
  let publication: ProductPublicationService;
  let gallery: PublicGalleryEntryQuery;
  let authoring: ReturnType<typeof galleryAuthoring>;
  let anon: ReturnType<typeof publicGalleryReader>;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createPublicMediaContext('h05c1-media-dimensions');
    catalog = ctx.api.app.get(PublicProductQuery);
    publication = ctx.api.app.get(ProductPublicationService);
    gallery = ctx.api.app.get(PublicGalleryEntryQuery);

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
    // Reused, not seeded: `uq_admin_accounts__status__active` permits exactly
    // one ACTIVE account, and the bootstrap above already created it.
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

  /** Publishes one product whose single image carries the given dimensions. */
  async function publishProduct(sized: boolean): Promise<string> {
    const assetId = await seedAsset(ctx.api, sized ? { dimensions: SIZED } : {});
    for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
      await ctx.putDerivative(assetId, kind, Buffer.from(`webp:${assetId}:${kind}`, 'utf8'));
    }
    const seeded = await seedPublishableProduct(ctx.api, { mediaAssetIds: [assetId] });
    await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );
    const rows = (
      await ctx.api.database.client.db.execute(
        sql`select slug from products where id = ${seeded.productId}`,
      )
    ).rows as { slug: string }[];
    const row = rows[0];
    if (row === undefined) throw new Error('seeded product not found');
    return row.slug;
  }

  /** Publishes one gallery entry whose single image carries the given dimensions. */
  async function publishGalleryEntry(sized: boolean): Promise<string> {
    const assetId = await seedDeliverableAsset(
      ctx.api,
      ctx.storage,
      sized ? { dimensions: SIZED } : {},
    );
    const entry = await authoring.createEntry();
    const attached = await authoring.attach(entry, [assetId]);
    const published = await authoring.publish(attached);
    return published.slug;
  }

  describe('Product media', () => {
    it('publishes the LIST rendition size on the card and the DETAIL rendition size on the page', async () => {
      const slug = await publishProduct(true);

      const page = await catalog.list({ limit: 100 });
      const card = page.items.find((item) => item.slug === slug);
      expect(card?.thumbnail).toBeDefined();
      // The card addresses `thumbnail`, so it must carry the THUMBNAIL size.
      expect(card?.thumbnail?.url).toContain('/thumbnail');
      expect(card?.thumbnail?.width).toBe(THUMBNAIL_SIZE.width);
      expect(card?.thumbnail?.height).toBe(THUMBNAIL_SIZE.height);

      const detail = await catalog.detail(slug);
      expect(detail.media).toHaveLength(1);
      // The page addresses `catalog-preview`, so it must carry the OTHER size —
      // which is what makes the pairing provable rather than plausible.
      expect(detail.media[0]?.url).toContain('/catalog-preview');
      expect(detail.media[0]?.width).toBe(PREVIEW_SIZE.width);
      expect(detail.media[0]?.height).toBe(PREVIEW_SIZE.height);
    });

    it('publishes positive dimensions, never zero or negative', async () => {
      const slug = await publishProduct(true);
      const detail = await catalog.detail(slug);
      for (const media of detail.media) {
        expect(media.width).toBeGreaterThan(0);
        expect(media.height).toBeGreaterThan(0);
      }
    });

    it('omits the size entirely when the stored derivative carries none', async () => {
      const slug = await publishProduct(false);

      const page = await catalog.list({ limit: 100 });
      const card = page.items.find((item) => item.slug === slug);
      // Still deliverable — eligibility did not change — but with no size.
      expect(card?.thumbnail?.url).toContain('/thumbnail');
      expect(card?.thumbnail).not.toHaveProperty('width');
      expect(card?.thumbnail).not.toHaveProperty('height');

      const detail = await catalog.detail(slug);
      expect(detail.media[0]?.url).toContain('/catalog-preview');
      expect(detail.media[0]).not.toHaveProperty('width');
      expect(detail.media[0]).not.toHaveProperty('height');
    });
  });

  describe('Gallery media', () => {
    it('publishes the LIST rendition size on the cover and the DETAIL rendition size on the page', async () => {
      await anon.clearGallery();
      const slug = await publishGalleryEntry(true);

      const feed = await gallery.list({ limit: 100 });
      const summary = feed.items.find((item) => item.slug === slug);
      expect(summary?.coverUrl).toContain('/thumbnail');
      expect(summary?.coverWidth).toBe(THUMBNAIL_SIZE.width);
      expect(summary?.coverHeight).toBe(THUMBNAIL_SIZE.height);

      const detail = await gallery.detail(slug);
      expect(detail.assets).toHaveLength(1);
      expect(detail.assets[0]?.url).toContain('/catalog-preview');
      expect(detail.assets[0]?.width).toBe(PREVIEW_SIZE.width);
      expect(detail.assets[0]?.height).toBe(PREVIEW_SIZE.height);
    });

    it('omits the cover size entirely when the stored derivative carries none', async () => {
      await anon.clearGallery();
      const slug = await publishGalleryEntry(false);

      const feed = await gallery.list({ limit: 100 });
      const summary = feed.items.find((item) => item.slug === slug);
      expect(summary?.coverUrl).toContain('/thumbnail');
      expect(summary).not.toHaveProperty('coverWidth');
      expect(summary).not.toHaveProperty('coverHeight');

      const detail = await gallery.detail(slug);
      expect(detail.assets[0]).not.toHaveProperty('width');
      expect(detail.assets[0]).not.toHaveProperty('height');
    });
  });

  describe('the additive fields leak nothing', () => {
    it('carries no storage locator, bucket or checksum in either payload', async () => {
      const productSlug = await publishProduct(true);
      await anon.clearGallery();
      const gallerySlug = await publishGalleryEntry(true);

      const payloads: unknown[] = [
        await catalog.list({ limit: 100 }),
        await catalog.detail(productSlug),
        await gallery.list({ limit: 100 }),
        await gallery.detail(gallerySlug),
      ];

      for (const payload of payloads) {
        for (const text of stringsIn(payload)) {
          for (const pattern of PRIVATE_LOCATOR_PATTERNS) {
            expect(text).not.toMatch(pattern);
          }
        }
      }
    });
  });
});

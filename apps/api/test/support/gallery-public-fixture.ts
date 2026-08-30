/**
 * Live-database fixtures for the `APP11-B03` public gallery suite.
 *
 * Gallery entries are built through the **real** delivered Admin API — a
 * fixture can never publish an entry the operator surface could not — and the
 * assets behind them are seeded with explicit SQL plus a real object in the
 * disposable MinIO, because no delivered pipeline produces a `PUBLIC`
 * `GALLERY_MEDIA` asset or its derivatives yet (the asset-inspection worker
 * owns the `CATALOG_MEDIA`/`PRODUCTION_SENSITIVE` and
 * `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` lanes only). Seeding the persisted state
 * directly is the only way to exercise the delivery contract that state
 * defines.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';
import { Readable } from 'node:stream';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import type { ApiIntegrationTestContext } from './api-integration-context';
import {
  GALLERY_ENTRIES_PATH,
  galleryAssetsUrl,
  galleryPublicationUrl,
  type Envelope,
  type GalleryEntryPayload,
} from './gallery-lifecycle-fixture';

export const PUBLIC_GALLERY_PATH = '/api/public/gallery-entries';

export const publicGalleryDetailUrl = (slug: string) => `${PUBLIC_GALLERY_PATH}/${slug}`;
export const publicGalleryMediaUrl = (slug: string, assetId: string, rendition: string) =>
  `${PUBLIC_GALLERY_PATH}/${slug}/assets/${assetId}/${rendition}`;

/** The two renditions the public route serves, and their persisted kinds. */
export const LIST_KIND = 'THUMBNAIL';
export const DETAIL_KIND = 'CATALOG_PREVIEW';

export interface PublicGallerySummary {
  readonly galleryEntryId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly isIndexable: boolean;
  readonly coverAssetId: string;
  readonly coverUrl: string;
  readonly assetCount: number;
}

export interface PublicGalleryListPayload {
  readonly items: readonly PublicGallerySummary[];
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
}

export interface PublicGalleryDetailPayload {
  readonly galleryEntryId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly assets: readonly { assetId: string; position: number; url: string }[];
  readonly seo: { title?: string; description?: string; isIndexable: boolean };
  readonly linkedProduct: { slug: string; name: string; thumbnailUrl?: string } | null;
}

export type AssetClassification = 'PUBLIC' | 'CUSTOMER_PRIVATE' | 'PRODUCTION_SENSITIVE';

export interface SeedAssetOptions {
  readonly classification?: AssetClassification;
  readonly status?: string;
  /** Persisted derivative kinds; omit one to make that rendition unserveable. */
  readonly derivatives?: readonly string[];
  readonly derivativeStatus?: string;
  readonly isWatermarked?: boolean;
  /** When false the row is written but no object is stored behind it. */
  readonly storeObject?: boolean;
}

/** The key layout `public-media-context.ts` addresses. */
export function derivativeKey(assetId: string, kind: string): string {
  return `development/derivatives/${assetId}/${kind}.webp`;
}

/**
 * Seeds one asset, its derivative rows and the objects behind them.
 *
 * Defaults describe the ordinary case — a `PUBLIC` gallery image with both
 * renditions ready — so a test states only the fact it is about.
 */
export async function seedDeliverableAsset(
  ctx: ApiIntegrationTestContext,
  storage: ObjectStoragePort,
  options: SeedAssetOptions = {},
): Promise<string> {
  const {
    classification = 'PUBLIC',
    status = 'UPLOADED',
    derivatives = [LIST_KIND, DETAIL_KIND],
    derivativeStatus = 'READY',
    isWatermarked = false,
    storeObject = true,
  } = options;

  const id = newId();
  const kind = classification === 'PUBLIC' ? 'GALLERY_MEDIA' : 'CUSTOMER_UPLOAD';
  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${id}, ${kind}, ${classification}, ${`gallery/${id}.png`}, 'image/png', 512, ${status})
  `);

  for (const derivativeKind of derivatives) {
    const key = derivativeStatus === 'READY' ? derivativeKey(id, derivativeKind) : null;
    await ctx.database.client.db.execute(sql`
      insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
      values (${newId()}, ${id}, ${derivativeKind}, ${derivativeStatus}, ${key}, ${isWatermarked})
    `);
    if (key !== null && storeObject) {
      const bytes = Buffer.from(`webp:${id}:${derivativeKind}`, 'utf8');
      await storage.putObjectStream({
        bucket: 'DERIVATIVES',
        key,
        body: Readable.from([bytes]),
        contentType: 'image/webp',
        contentLengthBytes: bytes.byteLength,
      });
    }
  }
  return id;
}

/** Moves a seeded asset to another lifecycle state, as a withdrawal would. */
export async function setAssetStatus(
  ctx: ApiIntegrationTestContext,
  assetId: string,
  status: string,
): Promise<void> {
  await ctx.database.client.db.execute(
    sql`update assets set status = ${status} where id = ${assetId}`,
  );
}

/** Marks a seeded asset tombstoned, exactly as phase-two deletion would. */
export async function tombstoneAsset(
  ctx: ApiIntegrationTestContext,
  assetId: string,
): Promise<void> {
  await ctx.database.client.db.execute(
    sql`update assets set status = 'DELETED', deleted_at = now() where id = ${assetId}`,
  );
}

/** Points a gallery entry at a product without going through the Admin API. */
export async function linkProduct(
  ctx: ApiIntegrationTestContext,
  galleryEntryId: string,
  productId: string | null,
): Promise<void> {
  await ctx.database.client.db.execute(
    sql`update gallery_entries set linked_product_id = ${productId} where id = ${galleryEntryId}`,
  );
}

/** The safe error envelope, typed so an assertion is not an `any` probe. */
export function errorOf(res: { readonly body: unknown }): { code: string; message: string } {
  return res.body as { code: string; message: string };
}

/** The streamed bytes of a binary response. */
export function bodyText(res: { readonly body: unknown }): string {
  return (res.body as Buffer).toString('utf8');
}

/**
 * The anonymous reader: every call it makes carries no cookie, no Origin and
 * no header of any kind, which is what makes "these routes are public" an
 * observation rather than a claim.
 */
export function publicGalleryReader(ctx: ApiIntegrationTestContext) {
  const get = (path: string) => ctx.http.get(path);

  return {
    get,

    async feed(query = ''): Promise<PublicGalleryListPayload> {
      const res = await get(`${PUBLIC_GALLERY_PATH}${query}`);
      expect(res.status).toBe(200);
      return (res.body as Envelope<PublicGalleryListPayload>).data;
    },

    async detail(slug: string): Promise<PublicGalleryDetailPayload> {
      const res = await get(publicGalleryDetailUrl(slug));
      expect(res.status).toBe(200);
      return (res.body as Envelope<PublicGalleryDetailPayload>).data;
    },

    /** Removes every entry so a feed assertion sees only the rows it arranged. */
    async clearGallery(): Promise<void> {
      await ctx.database.client.db.execute(sql`delete from gallery_entry_assets`);
      await ctx.database.client.db.execute(sql`delete from gallery_entries`);
    },

    /**
     * The one ACTIVE admin account, for the publication recorder's audit row.
     * Reused rather than seeded: `uq_admin_accounts__status__active` permits
     * exactly one.
     */
    async bootstrappedAdminId(): Promise<string> {
      const found = await ctx.database.client.db.execute(
        sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
      );
      return (found.rows[0] as { id: string }).id;
    },
  };
}

/**
 * The Admin helpers this suite needs: create, attach, publish.
 *
 * Deliberately a second, smaller fixture than `galleryFixture` — this suite
 * only ever uses the Admin surface to *arrange* published state, and asserts
 * against the anonymous one.
 */
export function galleryAuthoring(ctx: ApiIntegrationTestContext, cookie: string, origin: string) {
  const authed = {
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', origin),
    put: (path: string) => ctx.http.put(path).set('Cookie', cookie).set('Origin', origin),
    delete: (path: string) => ctx.http.delete(path).set('Cookie', cookie).set('Origin', origin),
  };

  let counter = 0;

  async function createEntry(
    overrides: Record<string, unknown> = {},
  ): Promise<GalleryEntryPayload> {
    counter += 1;
    const unique = `${newId().replaceAll('-', '').slice(-8)}${counter}`;
    const res = await authed.post(GALLERY_ENTRIES_PATH).send({
      title: 'Bộ sưu tập hoa sen',
      slug: `bo-suu-tap-${unique}`,
      description: 'Thêu tay trên vải lanh.',
      displayOrder: 100,
      isIndexable: true,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  async function attach(
    entry: GalleryEntryPayload,
    assetIds: readonly string[],
  ): Promise<GalleryEntryPayload> {
    const res = await authed
      .put(galleryAssetsUrl(entry.galleryEntryId))
      .send({ assetIds, expectedUpdatedAt: entry.updatedAt });
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  async function publish(entry: GalleryEntryPayload): Promise<GalleryEntryPayload> {
    const res = await authed
      .post(galleryPublicationUrl(entry.galleryEntryId))
      .send({ expectedUpdatedAt: entry.updatedAt });
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  async function unpublish(entry: GalleryEntryPayload): Promise<GalleryEntryPayload> {
    const res = await authed
      .delete(galleryPublicationUrl(entry.galleryEntryId))
      .send({ expectedUpdatedAt: entry.updatedAt });
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  /** A PUBLISHED entry holding the given images, in the given order. */
  async function published(
    assetIds: readonly string[],
    overrides: Record<string, unknown> = {},
  ): Promise<GalleryEntryPayload> {
    return publish(await attach(await createEntry(overrides), assetIds));
  }

  return { authed, createEntry, attach, publish, unpublish, published };
}

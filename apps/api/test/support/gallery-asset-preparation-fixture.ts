/**
 * Live fixtures for the `APP11-B03A` gallery-asset preparation suite.
 *
 * The one rule that shapes this file: **no gallery asset is ever seeded.** The
 * whole point of the checkpoint is that the derived `GALLERY_MEDIA` / `PUBLIC`
 * row and its `READY` derivatives are producible through the delivered API, so
 * a fixture that inserted one would prove nothing. Everything on the gallery
 * side of these tests comes back from `POST /api/admin/gallery-assets`.
 *
 * What *is* seeded is the catalog source, and only because that lane predates
 * APP11: `product-publication-fixtures.seedAsset` writes exactly the rows the
 * asset-inspection worker would have written, and this file adds the objects
 * behind them so a real provider-side copy has something to copy.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { Readable } from 'node:stream';

import { seedAsset, type SeededAssetOptions } from './product-publication-fixtures';
import type { ApiIntegrationTestContext } from './api-integration-context';
import type { PublicMediaTestContext } from './public-media-context';

/** Synthetic, non-secret operator credentials for the suite's Admin session. */
export const PREPARATION_FIXTURE_EMAIL = 'gallery-preparation@example.test';
export const PREPARATION_FIXTURE_PASSWORD = 'operator-secret-123';

export const GALLERY_ASSETS_PATH = '/api/admin/gallery-assets';
export const ADMIN_ASSETS_PATH = '/api/admin/assets';

export const galleryAssetPreviewUrl = (assetId: string, rendition: string) =>
  `${GALLERY_ASSETS_PATH}/${assetId}/${rendition}`;

/** Distinct per kind, so an assertion can tell which object was streamed. */
export const THUMBNAIL_BYTES = Buffer.from('webp-thumbnail-bytes', 'utf8');
export const PREVIEW_BYTES = Buffer.from('webp-catalog-preview-bytes', 'utf8');
export const ORIGINAL_BYTES = Buffer.from('png-original-bytes', 'utf8');

export interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

/** The Admin asset detail payload, exactly as `adminAsset_detail` publishes it. */
export interface AdminAssetPayload {
  readonly assetId: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The prepared gallery asset, exactly as `adminGalleryAsset_create` publishes it. */
export interface GalleryAssetPayload extends AdminAssetPayload {
  readonly renditions: readonly { rendition: string; url: string }[];
}

export interface CatalogSource {
  readonly assetId: string;
  /** The concurrency token, read back through the delivered Admin detail route. */
  readonly updatedAt: string;
}

/** The original object's key, matching what `seedAsset` records on the row. */
export const originalKey = (assetId: string) => `development/originals/${assetId}/original.png`;

/**
 * Seeds one catalog source and stores the three objects behind it.
 *
 * `storeObjects: false` writes the rows but no bytes, which is how the storage
 * failure path is reached without stubbing the provider.
 */
export async function seedCatalogSource(
  ctx: PublicMediaTestContext,
  options: SeededAssetOptions & { readonly storeObjects?: boolean } = {},
): Promise<string> {
  const { storeObjects = true, ...assetOptions } = options;
  const assetId = await seedAsset(ctx.api, assetOptions);
  if (!storeObjects) {
    return assetId;
  }
  await ctx.storage.putObjectStream({
    bucket: 'ORIGINALS',
    key: originalKey(assetId),
    body: Readable.from([ORIGINAL_BYTES]),
    contentType: 'image/png',
    contentLengthBytes: ORIGINAL_BYTES.byteLength,
  });
  for (const [kind, bytes] of [
    ['THUMBNAIL', THUMBNAIL_BYTES],
    ['CATALOG_PREVIEW', PREVIEW_BYTES],
  ] as const) {
    await ctx.putDerivative(assetId, kind, bytes);
  }
  return assetId;
}

/** The persisted asset row, for assertions the safe projection cannot make. */
export async function assetRow(
  ctx: ApiIntegrationTestContext,
  assetId: string,
): Promise<{
  id: string;
  kind: string;
  classification: string;
  status: string;
  storage_key: string;
  deleted_at: Date | null;
}> {
  const found = await ctx.database.client.db.execute(
    sql`select id, kind, classification, status, storage_key, deleted_at
        from assets where id = ${assetId}`,
  );
  return found.rows[0] as never;
}

/** The persisted derivative rows for one asset, ordered by kind. */
export async function derivativeRows(
  ctx: ApiIntegrationTestContext,
  assetId: string,
): Promise<{ kind: string; status: string; storage_key: string | null }[]> {
  const found = await ctx.database.client.db.execute(
    sql`select kind, status, storage_key from asset_derivatives
        where asset_id = ${assetId} order by kind`,
  );
  return found.rows as never;
}

/** How many gallery-lane assets exist, so a refusal can be proved to create none. */
export async function galleryAssetCount(ctx: ApiIntegrationTestContext): Promise<number> {
  const found = await ctx.database.client.db.execute(
    sql`select count(*)::int as n from assets
        where kind = 'GALLERY_MEDIA' and classification = 'PUBLIC'`,
  );
  return (found.rows[0] as { n: number }).n;
}

/** The safe error envelope, typed so an assertion is not an `any` probe. */
export function errorOf(res: { readonly body: unknown }): { code: string; message: string } {
  return res.body as { code: string; message: string };
}

/**
 * The authenticated operator, and the four calls this suite makes as one.
 *
 * Every helper returns the payload the API just published, so a test reads as
 * the sequence of operator actions it describes rather than as envelope
 * unwrapping.
 */
export function preparationClient(ctx: ApiIntegrationTestContext, cookie: string, origin: string) {
  const authed = {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', origin),
  };

  /** The source as the operator reads it, token included. */
  async function source(assetId: string): Promise<CatalogSource> {
    const res = await authed.get(`${ADMIN_ASSETS_PATH}/${assetId}`);
    expect(res.status).toBe(200);
    const asset = (res.body as Envelope<AdminAssetPayload>).data;
    return { assetId: asset.assetId, updatedAt: asset.updatedAt };
  }

  /** The raw response, for the cases that assert a refusal. */
  const attempt = (body: Record<string, unknown>) => authed.post(GALLERY_ASSETS_PATH).send(body);

  async function prepare(from: CatalogSource): Promise<GalleryAssetPayload> {
    const res = await attempt({
      sourceAssetId: from.assetId,
      expectedSourceUpdatedAt: from.updatedAt,
    });
    expect(res.status).toBe(201);
    return (res.body as Envelope<GalleryAssetPayload>).data;
  }

  /** Seeds a catalog source, reads its token, and prepares from it. */
  async function preparedFrom(
    media: PublicMediaTestContext,
    options?: Parameters<typeof seedCatalogSource>[1],
  ): Promise<GalleryAssetPayload> {
    return prepare(await source(await seedCatalogSource(media, options)));
  }

  return {
    authed,
    source,
    attempt,
    prepare,
    preparedFrom,

    detail: (assetId: string, scope?: string) =>
      authed.get(
        scope === undefined
          ? `${ADMIN_ASSETS_PATH}/${assetId}`
          : `${ADMIN_ASSETS_PATH}/${assetId}?scope=${scope}`,
      ),

    list: (query = '') => authed.get(`${ADMIN_ASSETS_PATH}${query}`),

    preview: (assetId: string, rendition: string) =>
      authed.get(galleryAssetPreviewUrl(assetId, rendition)).responseType('blob'),
  };
}

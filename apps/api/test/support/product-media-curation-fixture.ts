/**
 * The world `APP12-M01.B2`'s media-curation suites run against.
 *
 * Everything here builds state through a **delivered operation** wherever one
 * exists — the product is created, patched and published over HTTP, so the
 * suites test the commands rather than their own SQL. The two exceptions are
 * `assets` and `asset_derivatives`, which have no Admin write path at all in
 * this repository: the upload lane belongs to the intake module and the
 * derivatives are produced by the worker, neither of which a media-curation
 * suite should have to stand up. Those rows are inserted directly and are the
 * only direct writes.
 *
 * Every value is synthetic. No credential, storage address or real image
 * appears, and nothing here ever touches the shared development database — the
 * caller supplies a disposable context.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import type { ApiIntegrationTestContext } from './api-integration-context';

export const ADMIN_ORIGIN = 'http://admin.embroidery.local';

export interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
  readonly errors?: { field: string; code: string; message: string }[];
}

export interface ProductPayload {
  readonly productId: string;
  readonly slug: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly basePriceAmount: string;
  readonly media: { assetId: string; role: string; position: number }[];
}

export interface StoredMediaRow {
  readonly asset_id: string;
  readonly role: string;
  readonly display_order: number;
}

/** How complete an Asset is — which is what makes it publication-viable or not. */
export type AssetShape =
  /** `ACCEPTED`, both required derivatives `READY` and unwatermarked. */
  | 'READY'
  /** `ACCEPTED`, but only the `THUMBNAIL` derivative exists. */
  | 'MISSING_DERIVATIVE'
  /** Inspection rejected it. */
  | 'REJECTED'
  /** Tombstoned after acceptance; the metadata row survives. */
  | 'TOMBSTONED';

export function authed(ctx: ApiIntegrationTestContext, cookie: string) {
  return {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    patch: (path: string) => ctx.http.patch(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    put: (path: string) => ctx.http.put(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
  };
}

export async function loginAdmin(
  ctx: ApiIntegrationTestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await ctx.http
    .post('/api/staff/session')
    .set('Origin', ADMIN_ORIGIN)
    .send({ email, password });
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const session = cookies.find((value) => value.startsWith('adm_session='));
  if (session === undefined) {
    throw new Error('login set no adm_session cookie');
  }
  return session.split(';')[0] as string;
}

/**
 * One catalog-media Asset in the requested shape.
 *
 * A `REJECTED` asset still carries both derivatives on purpose: it must be
 * refused for its *status*, and an asset that also happened to be missing a
 * derivative would not prove which rule did the refusing.
 */
export async function seedAsset(
  ctx: ApiIntegrationTestContext,
  shape: AssetShape = 'READY',
): Promise<string> {
  const id = newId();
  const status =
    shape === 'REJECTED' ? 'REJECTED' : shape === 'TOMBSTONED' ? 'DELETED' : 'ACCEPTED';
  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status, deleted_at)
    values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
            ${`development/originals/${id}/original.png`}, 'image/png', 51200,
            ${`sha256:${'b'.repeat(64)}`}, ${status},
            ${shape === 'TOMBSTONED' ? sql`now()` : sql`null`})
  `);

  const kinds = shape === 'MISSING_DERIVATIVE' ? ['THUMBNAIL'] : ['THUMBNAIL', 'CATALOG_PREVIEW'];
  for (const kind of kinds) {
    await ctx.database.client.db.execute(sql`
      insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
      values (${newId()}, ${id}, ${kind}, 'READY',
              ${`development/derivatives/${id}/${kind}.webp`}, false)
    `);
  }
  return id;
}

export async function seedAssets(
  ctx: ApiIntegrationTestContext,
  count: number,
  shape: AssetShape = 'READY',
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push(await seedAsset(ctx, shape));
  }
  return ids;
}

/** A DRAFT with a name, a description and a publishable price — no media yet. */
export async function createDraft(
  api: ReturnType<typeof authed>,
  name: string,
): Promise<ProductPayload> {
  const created = await api.post('/api/admin/products').send({
    categorySlug: 'thu-bong',
    name: `${name} ${newId().slice(-6)}`,
    description: 'Mô tả.',
  });
  if (created.status !== 201) {
    throw new Error(`draft creation failed: ${created.status}`);
  }
  const draft = (created.body as Envelope<ProductPayload>).data;
  const priced = await api
    .patch(`/api/admin/products/${draft.productId}`)
    .send({ expectedUpdatedAt: draft.updatedAt, basePriceAmount: '250000' });
  if (priced.status !== 200) {
    throw new Error(`draft pricing failed: ${priced.status}`);
  }
  return (priced.body as Envelope<ProductPayload>).data;
}

/**
 * A PUBLISHED product carrying exactly `assetIds`, reached the long way round —
 * patch the media as a DRAFT, then publish. That is the pre-B2 world, and it is
 * how every live journey starts, so no journey can accidentally prove itself
 * with a product that B2 itself put into `PUBLISHED`.
 */
export async function createPublished(
  api: ReturnType<typeof authed>,
  name: string,
  assetIds: readonly string[],
): Promise<ProductPayload> {
  const draft = await createDraft(api, name);
  const withMedia = await api
    .patch(`/api/admin/products/${draft.productId}`)
    .send({ expectedUpdatedAt: draft.updatedAt, mediaAssetIds: assetIds });
  if (withMedia.status !== 200) {
    throw new Error(`media attach failed: ${withMedia.status}`);
  }
  const attached = (withMedia.body as Envelope<ProductPayload>).data;

  const published = await api
    .post(`/api/admin/products/${attached.productId}/publish`)
    .send({ expectedUpdatedAt: attached.updatedAt });
  if (published.status !== 200) {
    throw new Error(`publish failed: ${published.status} ${JSON.stringify(published.body)}`);
  }
  // The publish response is the publication projection, which carries no media;
  // the Admin detail read is the one that returns the full ordered selection.
  const detail = await api.get(`/api/admin/products/${attached.productId}`);
  return (detail.body as Envelope<ProductPayload>).data;
}

/** The stored rows, read directly — the only way to prove a refusal wrote nothing. */
export async function storedMedia(
  ctx: ApiIntegrationTestContext,
  productId: string,
): Promise<StoredMediaRow[]> {
  // `execute` narrows to a row type with an index signature, so the columns are
  // read out by name rather than spread — which also makes `display_order`'s
  // numeric conversion explicit instead of relying on the driver's shape.
  const { rows } = await ctx.database.client.db.execute<Record<string, unknown>>(sql`
    select asset_id, role, display_order from product_media
    where product_id = ${productId} order by display_order
  `);
  return rows.map((row) => ({
    asset_id: row['asset_id'] as string,
    role: row['role'] as string,
    display_order: Number(row['display_order']),
  }));
}

/** The stored rows including their association ids, which public URLs embed. */
export async function storedMediaIds(
  ctx: ApiIntegrationTestContext,
  productId: string,
): Promise<Map<string, string>> {
  const { rows } = await ctx.database.client.db.execute<Record<string, unknown>>(sql`
    select id, asset_id from product_media where product_id = ${productId}
  `);
  return new Map(rows.map((row) => [row['asset_id'] as string, row['id'] as string]));
}

/** The commercial facts a media write must never move. */
export async function commercialFacts(
  ctx: ApiIntegrationTestContext,
  productId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await ctx.database.client.db.execute<Record<string, unknown>>(sql`
    select name, slug, description, category_id, base_price_amount, currency_code,
           status, display_order, archived_at
    from products where id = ${productId}
  `);
  return rows[0] as Record<string, unknown>;
}

/**
 * `APP2-B04` over real HTTP, through the real Nest application.
 *
 * The service suite proves the query; this one proves the *transport*: that the
 * routes are anonymous, that the envelope and request id are canonical, that
 * validation rejects at the boundary rather than inside, and that the documented
 * cache header actually reaches the wire. A service test cannot see any of that.
 */
import { sql } from 'drizzle-orm';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(180_000);

const LIST_PATH = '/api/public/products';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
  readonly meta: { readonly requestId: string; readonly timestamp: string };
}

interface MediaReference {
  readonly url: string;
  readonly role: string;
}

interface Summary {
  readonly slug: string;
  readonly name: string;
  readonly category: { readonly slug: string; readonly name: string };
  readonly price: { readonly amount: string; readonly currency: string };
  readonly isDisplayOutOfStock: boolean;
  readonly thumbnail?: MediaReference;
}

interface ListPayload {
  readonly items: readonly Summary[];
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
}

interface DetailPayload extends Summary {
  readonly description?: string;
  readonly media: readonly MediaReference[];
  readonly seo: {
    readonly title?: string;
    readonly description?: string;
    readonly isIndexable: boolean;
  };
}

describe('public catalog API', () => {
  let ctx: ApiIntegrationTestContext;
  let adminId: string;
  let publishedSlug: string;
  let draftSlug: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b04-public-catalog-api');
    adminId = await seedAdminId(ctx);

    const published = await seedPublishableProduct(ctx, { categorySlug: 'khan' });
    const publication = ctx.app.get(ProductPublicationService);
    await asAdmin(ctx, adminId, () =>
      publication.publish({
        productId: published.productId,
        expectedUpdatedAt: new Date(published.updatedAt),
      }),
    );
    publishedSlug = await slugOf(published.productId);

    const draft = await seedPublishableProduct(ctx);
    draftSlug = await slugOf(draft.productId);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function slugOf(productId: string): Promise<string> {
    const rows = await ctx.database.client.db.execute<{ slug: string }>(
      sql`select slug from products where id = ${productId}`,
    );
    return rows.rows[0]!.slug;
  }

  it('serves the list anonymously, with no cookie and no session', async () => {
    const response = await ctx.http.get(LIST_PATH);
    const body = response.body as Envelope<ListPayload>;

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(body.success).toBe(true);
    expect(body.code).toBe('PUBLIC_PRODUCT_LIST_READ');
    expect(typeof body.meta.requestId).toBe('string');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.hasNext).toBe('boolean');
  });

  it('sends the documented no-store policy on both operations', async () => {
    const list = await ctx.http.get(LIST_PATH);
    const detail = await ctx.http.get(`${LIST_PATH}/${publishedSlug}`);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(detail.headers['cache-control']).toBe('no-store');
  });

  it('echoes a safe inbound request id through the envelope', async () => {
    const requestId = 'b04-public-catalog-1';
    const response = await ctx.http.get(LIST_PATH).set('X-Request-ID', requestId);
    expect((response.body as Envelope<ListPayload>).meta.requestId).toBe(requestId);
  });

  it('returns a published product by slug with a complete public projection', async () => {
    const response = await ctx.http.get(`${LIST_PATH}/${publishedSlug}`);
    const body = response.body as Envelope<DetailPayload>;

    expect(response.status).toBe(200);
    expect(body.code).toBe('PUBLIC_PRODUCT_DETAIL_READ');
    expect(body.data.slug).toBe(publishedSlug);
    expect(body.data.category).toEqual({ slug: 'khan', name: 'Khăn' });
    expect(body.data.price).toEqual({ amount: '250000', currency: 'VND' });
    expect(typeof body.data.seo.isIndexable).toBe('boolean');
    expect(Array.isArray(body.data.media)).toBe(true);
  });

  it('gives unknown and draft slugs the identical safe 404', async () => {
    const unknown = await ctx.http.get(`${LIST_PATH}/khong-ton-tai-bao-gio`);
    const draft = await ctx.http.get(`${LIST_PATH}/${draftSlug}`);
    const unknownBody = unknown.body as Envelope<unknown>;
    const draftBody = draft.body as Envelope<unknown>;

    expect(unknown.status).toBe(404);
    expect(draft.status).toBe(404);
    expect(draftBody.code).toBe('PUBLIC_PRODUCT_NOT_FOUND');
    expect(draftBody.code).toBe(unknownBody.code);
    expect(draftBody.message).toBe(unknownBody.message);
    expect(JSON.stringify(draftBody)).not.toContain(draftSlug);
  });

  it('rejects an unknown query parameter instead of ignoring it', async () => {
    for (const query of ['includeDraft=true', 'status=DRAFT', 'search=khan', 'sort=price']) {
      const response = await ctx.http.get(`${LIST_PATH}?${query}`);
      expect(response.status).toBe(400);
    }
  });

  it('rejects an out-of-range page size and a malformed slug', async () => {
    expect((await ctx.http.get(`${LIST_PATH}?limit=0`)).status).toBe(400);
    expect((await ctx.http.get(`${LIST_PATH}?limit=101`)).status).toBe(400);
    expect((await ctx.http.get(`${LIST_PATH}/Khong_Hop_Le`)).status).toBe(400);
  });

  it('rejects a malformed cursor with the safe cursor code', async () => {
    const response = await ctx.http.get(`${LIST_PATH}?cursor=not-a-cursor`);
    expect(response.status).toBe(400);
    expect((response.body as Envelope<unknown>).code).toBe('PUBLIC_PRODUCT_CURSOR_INVALID');
  });

  it('carries a cursor across pages over the wire', async () => {
    const first = await ctx.http.get(`${LIST_PATH}?limit=1`);
    const firstBody = first.body as Envelope<ListPayload>;
    expect(first.status).toBe(200);
    if (firstBody.data.nextCursor === null) return;

    const second = await ctx.http.get(
      `${LIST_PATH}?limit=1&cursor=${encodeURIComponent(firstBody.data.nextCursor)}`,
    );
    const secondBody = second.body as Envelope<ListPayload>;
    expect(second.status).toBe(200);
    expect(secondBody.data.items[0]?.slug).not.toBe(firstBody.data.items[0]?.slug);
  });

  it('applies the category filter over the wire', async () => {
    const response = await ctx.http.get(`${LIST_PATH}?categorySlug=khan`);
    const body = response.body as Envelope<ListPayload>;
    expect(response.status).toBe(200);
    for (const item of body.data.items) {
      expect(item.category.slug).toBe('khan');
    }
    // `APP12-C01` widened this filter from a closed enum to the dynamic slug
    // shape, so a well-formed slug naming no public category is no longer a
    // 400 — it is a filtered, empty page. Refusing it would need a compiled
    // taxonomy, and would tell an anonymous caller which categories the store
    // holds in draft. What must never happen is the whole catalogue coming
    // back, which is asserted here rather than assumed.
    const unknown = await ctx.http.get(`${LIST_PATH}?categorySlug=khong-ton-tai`);
    expect(unknown.status).toBe(200);
    expect((unknown.body as Envelope<ListPayload>).data.items).toEqual([]);

    // A malformed slug is still refused at the boundary, before any query.
    expect((await ctx.http.get(`${LIST_PATH}?categorySlug=KHONG-TON-TAI`)).status).toBe(400);
  });

  it('exposes no internal identifier or storage detail on the wire', async () => {
    const list = await ctx.http.get(LIST_PATH);
    const detail = await ctx.http.get(`${LIST_PATH}/${publishedSlug}`);

    for (const response of [list, detail]) {
      const body = response.body as Envelope<unknown>;
      const serialized = JSON.stringify(body.data).toLowerCase();
      for (const forbidden of [
        'storagekey',
        'storage_key',
        'bucket',
        'checksum',
        'sha256',
        'etag',
        'minio',
        'amazonaws',
        'archivedat',
        'updatedat',
        '"status"',
        'productmediaid',
        'assetid',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(serialized).not.toMatch(/https?:\/\//);
    }
  });

  it('projects every media reference as the approved relative route', async () => {
    const detail = await ctx.http.get(`${LIST_PATH}/${publishedSlug}`);
    for (const media of (detail.body as Envelope<DetailPayload>).data.media) {
      expect(media.url).toMatch(
        /^\/api\/public\/products\/[^/]+\/media\/[0-9a-f-]{36}\/catalog-preview$/,
      );
      expect(['THUMBNAIL', 'GALLERY']).toContain(media.role);
    }
    const list = await ctx.http.get(LIST_PATH);
    for (const item of (list.body as Envelope<ListPayload>).data.items) {
      if (item.thumbnail === undefined) continue;
      expect(item.thumbnail.url).toMatch(
        /^\/api\/public\/products\/[^/]+\/media\/[0-9a-f-]{36}\/thumbnail$/,
      );
    }
  });

  it('needs no Admin session, and offers no way to supply one', async () => {
    // A staff cookie changes nothing: the route has no guard to satisfy and no
    // branch that behaves differently for an authenticated caller.
    const anonymous = await ctx.http.get(LIST_PATH);
    const withCookie = await ctx.http.get(LIST_PATH).set('Cookie', 'adm_session=irrelevant');
    expect(withCookie.status).toBe(anonymous.status);
    expect((withCookie.body as Envelope<ListPayload>).data.items.length).toBe(
      (anonymous.body as Envelope<ListPayload>).data.items.length,
    );
  });
});

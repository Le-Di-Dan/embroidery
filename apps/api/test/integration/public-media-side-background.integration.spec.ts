/**
 * Public Side-background delivery against real PostgreSQL and real MinIO
 * (`APP3-B02` §10).
 *
 * Everything runs through HTTP rather than the service, because the facts this
 * suite exists to prove are transport facts: the exact bytes, the exact headers,
 * and the fact that a success body is *not* the JSON envelope. A service-level
 * assertion cannot see any of them.
 *
 * The second half is revocation. A public address is not a capability: the route
 * re-proves publication, category visibility, side activity, the background
 * association and the derivative on every request, so unpublishing, retiring or
 * replacing must each stop the *next* request even for a caller that already
 * holds the path. Each of those is asserted by taking a path that worked and
 * showing it stops working.
 */
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';

import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import {
  areaCommand,
  seedBackgroundAsset,
  sideCommand,
} from '../support/product-placement-fixtures';
import { ProductPlacementQuery } from '../../src/modules/catalog/application/product-placement.query';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';

/** Distinct content, so "the right object" is provable rather than plausible. */
const BACKGROUND_BYTES = Buffer.from('SIDE-BACKGROUND-'.repeat(96), 'utf8');
const REPLACEMENT_BYTES = Buffer.from('REPLACED-BACKGROUND-'.repeat(64), 'utf8');
const NORMALIZED = 'NORMALIZED';

interface HttpResult {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

describe('public side-background delivery (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let placement: ProductPlacementService;
  let publication: ProductPublicationService;
  let query: ProductPlacementQuery;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    ctx = await createPublicMediaContext('b02-side-background');
    adminId = await seedAdminId(ctx.api);
    placement = ctx.api.app.get(ProductPlacementService);
    publication = ctx.api.app.get(ProductPublicationService);
    query = ctx.api.app.get(ProductPlacementQuery);

    server = ctx.api.app.getHttpServer() as Server;
    if (!server.listening) await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${String(address.port)}`;
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  function fetchPath(path: string): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
      httpGet(`${origin}${path}`, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      }).on('error', reject);
    });
  }

  const rows = <T extends Record<string, unknown>>(statement: ReturnType<typeof sql>) =>
    ctx.api.database.client.db.execute(statement).then((result) => result.rows as T[]);

  const slugOf = async (productId: string): Promise<string> => {
    const [row] = await rows<{ slug: string }>(
      sql`select slug from products where id = ${productId}`,
    );
    return row?.slug ?? '';
  };

  interface Seeded {
    readonly productId: string;
    readonly slug: string;
    readonly updatedAt: string;
    readonly backgroundAssetId: string;
    readonly path: string;
  }

  /**
   * A published Product with one active Side whose background object really
   * exists, and whose recorded `byte_size` is the size actually written.
   */
  async function seedPublished(
    options: {
      readonly bytes?: Buffer;
      readonly background?: Parameters<typeof seedBackgroundAsset>[1];
      readonly withArea?: boolean;
      readonly sideCode?: string;
    } = {},
  ): Promise<Seeded> {
    const bytes = options.bytes ?? BACKGROUND_BYTES;
    const product = await asAdmin(ctx.api, adminId, () => seedPublishableProduct(ctx.api));
    const backgroundAssetId = await seedBackgroundAsset(ctx.api, {
      byteSize: bytes.length,
      widthPx: 2048,
      heightPx: 1536,
      ...options.background,
    });
    await ctx.putDerivative(backgroundAssetId, NORMALIZED, bytes);

    const view = await asAdmin(ctx.api, adminId, () =>
      placement.replace({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
        sides: [
          sideCommand({
            code: options.sideCode ?? 'front',
            backgroundAssetId,
            areas: options.withArea === false ? [] : [areaCommand()],
          }),
        ],
      }),
    );

    const published = await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(view.updatedAt),
      }),
    );
    const slug = await slugOf(product.productId);

    return {
      productId: product.productId,
      slug,
      updatedAt: published.updatedAt,
      backgroundAssetId,
      path: `/api/public/products/${slug}/sides/${options.sideCode ?? 'front'}/background`,
    };
  }

  describe('the happy path', () => {
    it('streams the exact NORMALIZED object', async () => {
      const seeded = await seedPublished();
      const response = await fetchPath(seeded.path);

      expect(response.status).toBe(200);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(true);
    });

    it('sends the ruled headers and the reconciled length', async () => {
      const seeded = await seedPublished();
      const response = await fetchPath(seeded.path);

      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['content-length']).toBe(String(BACKGROUND_BYTES.length));
      // A filename would have to be invented: the upload name is never persisted.
      expect(String(response.headers['content-disposition'])).not.toContain('filename');
    });

    it('leaks no storage identity in any header', async () => {
      const seeded = await seedPublished();
      const response = await fetchPath(seeded.path);
      const serialized = JSON.stringify(response.headers);

      for (const forbidden of [
        ctx.derivativeKey(seeded.backgroundAssetId, NORMALIZED),
        seeded.backgroundAssetId,
        'DERIVATIVES',
        'amazonaws',
        'minio',
        'sha256',
        NORMALIZED,
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(response.headers['etag']).toBeUndefined();
    });

    it('does not wrap the binary in the JSON envelope', async () => {
      const seeded = await seedPublished();
      const response = await fetchPath(seeded.path);
      expect(response.body.subarray(0, 1).toString('utf8')).not.toBe('{');
    });
  });

  describe('the manifest and the route agree', () => {
    it('publishes the exact quartet and a path that resolves to the same bytes', async () => {
      const seeded = await seedPublished();
      const manifest = await query.publicRead(seeded.slug);
      const delivery = manifest.sides[0]?.background.delivery;

      expect(delivery).toEqual({
        path: seeded.path,
        widthPx: 2048,
        heightPx: 1536,
        mediaType: 'image/webp',
        byteSize: BACKGROUND_BYTES.length,
      });

      // Following the emitted path returns the exact object it described.
      const response = await fetchPath(delivery?.path ?? '');
      expect(response.status).toBe(200);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(true);
      expect(response.headers['content-length']).toBe(String(delivery?.byteSize));
      expect(response.headers['content-type']).toBe(delivery?.mediaType);
    });

    it('distinguishes the placement canvas from the intrinsic dimensions', async () => {
      const seeded = await seedPublished();
      const side = (await query.publicRead(seeded.slug)).sides[0];

      // The authored Side canvas is 1000×1000; the derivative is 2048×1536.
      expect(side?.imageWidthPx).toBe(1000);
      expect(side?.imageHeightPx).toBe(1000);
      expect(side?.background.delivery?.widthPx).toBe(2048);
      expect(side?.background.delivery?.heightPx).toBe(1536);
    });

    it('exposes no private identity anywhere in the manifest', async () => {
      const seeded = await seedPublished();
      const serialized = JSON.stringify(await query.publicRead(seeded.slug));

      for (const forbidden of [
        seeded.backgroundAssetId,
        ctx.derivativeKey(seeded.backgroundAssetId, NORMALIZED),
        'backgroundAssetId',
        'storageKey',
        'retiredAt',
        'supersededById',
        'http://',
        'https://',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('reports no delivery and no eligibility when the derivative is unusable', async () => {
      const seeded = await seedPublished({ background: { derivativeStatus: 'PROCESSING' } });
      const manifest = await query.publicRead(seeded.slug);

      expect(manifest.studioEligible).toBe(false);
      expect(manifest.sides[0]?.background.delivery).toBeNull();
      expect(JSON.stringify(manifest)).not.toContain('/api/');
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });
  });

  describe('an address is not a capability', () => {
    it('stops serving the moment the product is unpublished', async () => {
      const seeded = await seedPublished();
      expect((await fetchPath(seeded.path)).status).toBe(200);

      await asAdmin(ctx.api, adminId, () =>
        publication.unpublish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('stops serving once the product is archived', async () => {
      const seeded = await seedPublished();
      await rows(sql`update products set archived_at = now() where id = ${seeded.productId}`);
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('stops serving once the category is withdrawn', async () => {
      const seeded = await seedPublished();
      const categoryId = sql`(select category_id from products where id = ${seeded.productId})`;
      // Restored in a `finally`: every fixture in this suite seeds into the same
      // category, so leaving it withdrawn would fail every later case for a
      // reason that has nothing to do with what it was testing.
      try {
        await rows(sql`update categories set status = 'DRAFT' where id = ${categoryId}`);
        expect((await fetchPath(seeded.path)).status).toBe(404);
      } finally {
        await rows(sql`update categories set status = 'PUBLISHED' where id = ${categoryId}`);
      }
      expect((await fetchPath(seeded.path)).status).toBe(200);
    });

    it('stops serving once the side is retired', async () => {
      const seeded = await seedPublished();
      await rows(
        sql`update product_sides set retired_at = now() where product_id = ${seeded.productId}`,
      );
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('serves the replacement, never the replaced object, at the same address', async () => {
      const seeded = await seedPublished();
      expect((await fetchPath(seeded.path)).body.equals(BACKGROUND_BYTES)).toBe(true);

      const replacement = await seedBackgroundAsset(ctx.api, {
        byteSize: REPLACEMENT_BYTES.length,
        widthPx: 800,
        heightPx: 600,
      });
      await ctx.putDerivative(replacement, NORMALIZED, REPLACEMENT_BYTES);
      const [current] = await rows<{ updated_at: Date }>(
        sql`select updated_at from products where id = ${seeded.productId}`,
      );
      // The Side is **retained by id**, so this is a background swap rather than
      // a retire-and-recreate — recreating would collide on the side code, and
      // it would also not be the case under test.
      const [side] = await rows<{ id: string; area_id: string }>(
        sql`select s.id, a.id as area_id from product_sides s
              join embroidery_areas a on a.product_side_id = s.id
             where s.product_id = ${seeded.productId} and s.retired_at is null`,
      );
      await asAdmin(ctx.api, adminId, () =>
        placement.replace({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(current?.updated_at ?? seeded.updatedAt),
          sides: [
            sideCommand({
              id: side?.id,
              code: 'front',
              backgroundAssetId: replacement,
              areas: [areaCommand({ id: side?.area_id })],
            }),
          ],
        }),
      );

      // The address is keyed by placement, not by artifact, so it keeps
      // resolving — to the *current* background and its new dimensions.
      const response = await fetchPath(seeded.path);
      expect(response.body.equals(REPLACEMENT_BYTES)).toBe(true);
      expect(response.headers['content-length']).toBe(String(REPLACEMENT_BYTES.length));
      expect((await query.publicRead(seeded.slug)).sides[0]?.background.delivery?.widthPx).toBe(
        800,
      );
    });

    it('refuses a side code belonging to another product', async () => {
      const mine = await seedPublished({ sideCode: 'front' });
      const other = await seedPublished({ sideCode: 'back' });

      expect(
        (await fetchPath(`/api/public/products/${mine.slug}/sides/back/background`)).status,
      ).toBe(404);
      expect((await fetchPath(other.path)).status).toBe(200);
    });

    it('answers an unknown address exactly as it answers a draft', async () => {
      const draft = await asAdmin(ctx.api, adminId, () => seedPublishableProduct(ctx.api));
      const draftSlug = await slugOf(draft.productId);

      const unknown = await fetchPath('/api/public/products/khong-ton-tai/sides/front/background');
      const unpublished = await fetchPath(
        `/api/public/products/${draftSlug}/sides/front/background`,
      );

      expect(unknown.status).toBe(404);
      expect(unpublished.status).toBe(404);
      // Compared on the parts a caller could distinguish them by. The envelope
      // also carries a per-request id and timestamp, which differ by
      // construction and reveal nothing about what exists.
      const shape = (body: Buffer) => {
        const { code, message } = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
        return { code, message };
      };
      expect(shape(unknown.body)).toEqual(shape(unpublished.body));
      expect(shape(unknown.body).code).toBe('PUBLIC_SIDE_BACKGROUND_NOT_FOUND');
    });
  });

  describe('an ineligible derivative never streams', () => {
    it.each([
      ['a non-READY derivative', { derivativeStatus: 'PROCESSING' as const }],
      ['a watermarked derivative', { watermarked: true }],
      ['a wrong derivative kind', { derivativeKind: 'CATALOG_PREVIEW' }],
      ['no derivative at all', { derivativeKind: null }],
    ])('refuses %s', async (_label, background) => {
      const seeded = await seedPublished({ background });
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('refuses an asset withdrawn after it was attached', async () => {
      // Seeded usable, then withdrawn: `APP3-B01` refuses a REJECTED asset at
      // authoring time, so the only way this state exists is a rejection that
      // happened *after* the placement was authored — which is exactly the case
      // the delivery route re-proves rather than trusting the earlier write.
      const seeded = await seedPublished();
      expect((await fetchPath(seeded.path)).status).toBe(200);

      await rows(sql`update assets set status = 'REJECTED' where id = ${seeded.backgroundAssetId}`);
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('refuses an asset tombstoned after it was attached', async () => {
      const seeded = await seedPublished();
      await rows(sql`update assets set deleted_at = now() where id = ${seeded.backgroundAssetId}`);
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });

    it('refuses an unapproved derivative media type, including Template SVG', async () => {
      const seeded = await seedPublished({
        background: { derivativeMediaType: 'image/svg+xml' },
      });
      // SVG is profile-invalid for SIDE_BACKGROUND (IMP-D044 PO-03) and a
      // sanitized Template is not a Side background.
      expect((await fetchPath(seeded.path)).status).toBe(404);
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('refuses an incomplete quartet', async () => {
      const seeded = await seedPublished();
      await rows(
        sql`update asset_derivatives set width_px = null, height_px = null,
                   media_type = null, byte_size = null
             where asset_id = ${seeded.backgroundAssetId} and status <> 'READY'`,
      );
      // A READY row cannot lose the quartet — the CHECK forbids it — so the
      // status is relaxed in the same statement the columns are cleared.
      await rows(
        sql`update asset_derivatives set status = 'PROCESSING', width_px = null, height_px = null,
                   media_type = null, byte_size = null, storage_key = null
             where asset_id = ${seeded.backgroundAssetId}`,
      );
      expect((await fetchPath(seeded.path)).status).toBe(404);
    });
  });

  describe('storage contradictions fail safely', () => {
    it('answers unavailable when the object is gone', async () => {
      const seeded = await seedPublished();
      await ctx.removeDerivative(seeded.backgroundAssetId, NORMALIZED);

      const response = await fetchPath(seeded.path);
      expect(response.status).toBe(503);
      expect(response.body.toString('utf8')).not.toContain(
        ctx.derivativeKey(seeded.backgroundAssetId, NORMALIZED),
      );
    });

    it('sends no body and no length when the provider size contradicts the row', async () => {
      // The row says one size; the object is another. Two authorities disagree,
      // so neither is sent — a provider length would contradict the manifest a
      // Studio already read, and the persisted one would truncate the response.
      const seeded = await seedPublished();
      await ctx.putDerivative(seeded.backgroundAssetId, NORMALIZED, Buffer.from('SHORTER', 'utf8'));

      const response = await fetchPath(seeded.path);
      expect(response.status).toBe(503);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(false);
      expect(response.body.toString('utf8')).not.toContain('SHORTER');
    });

    it('never returns the private original', async () => {
      const seeded = await seedPublished();
      const [row] = await rows<{ storage_key: string }>(
        sql`select storage_key from assets where id = ${seeded.backgroundAssetId}`,
      );
      const response = await fetchPath(seeded.path);

      expect(row?.storage_key).toContain('originals');
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(true);
      expect(JSON.stringify(response.headers)).not.toContain('originals');
    });
  });

  describe('the read path writes nothing', () => {
    it('appends no audit, outbox or domain row', async () => {
      const seeded = await seedPublished();
      const before = await counts();
      await fetchPath(seeded.path);
      await fetchPath(seeded.path);
      expect(await counts()).toEqual(before);
    });

    async function counts(): Promise<Record<string, string>> {
      const [row] = await rows<Record<string, string>>(
        sql`select (select count(*) from audit_events)::text as audit,
                   (select count(*) from outbox_events)::text as outbox,
                   (select count(*) from asset_derivatives)::text as derivatives,
                   (select count(*) from product_sides)::text as sides`,
      );
      return row ?? {};
    }
  });
});

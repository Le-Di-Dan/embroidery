/**
 * Public catalog-media delivery against real PostgreSQL and real MinIO
 * (`APP2-T01` §17/§21).
 *
 * Everything runs through HTTP rather than the service, because the facts this
 * suite exists to prove are transport facts: the exact bytes, the exact
 * headers, and the fact that a success body is *not* the JSON envelope. A
 * service-level assertion cannot see any of them.
 *
 * The visibility predicate has its own suite; this one is the happy path, the
 * response contract and the stream.
 */
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import type { ObjectStreamResult } from '@embroidery/object-storage';

import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';

/** Distinct per kind, so "the right object" is provable rather than plausible. */
const THUMBNAIL_BYTES = Buffer.from('THUMB-'.repeat(64), 'utf8');
const PREVIEW_BYTES = Buffer.from('PREVIEW-'.repeat(128), 'utf8');
const UNKNOWN_MEDIA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff';

describe('public catalog-media delivery (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let publication: ProductPublicationService;

  beforeAll(async () => {
    ctx = await createPublicMediaContext('t01-media-delivery');
    adminId = await seedAdminId(ctx.api);
    publication = ctx.api.app.get(ProductPublicationService);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  /** A PUBLISHED product whose first image has both objects really stored. */
  async function publishedProduct(): Promise<{
    slug: string;
    productId: string;
    thumbnailMediaId: string;
    galleryMediaId: string;
    assetIds: readonly string[];
    updatedAt: string;
  }> {
    const seeded = await seedPublishableProduct(ctx.api);
    for (const assetId of seeded.assetIds) {
      await ctx.putDerivative(assetId, 'THUMBNAIL', THUMBNAIL_BYTES);
      await ctx.putDerivative(assetId, 'CATALOG_PREVIEW', PREVIEW_BYTES);
    }
    const published = await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );

    const media = (
      await ctx.api.database.client.db.execute(sql`
        select id, role from product_media
        where product_id = ${seeded.productId} order by display_order
      `)
    ).rows as { id: string; role: string }[];

    const thumbnail = media.find((row) => row.role === 'THUMBNAIL');
    const gallery = media.find((row) => row.role === 'GALLERY');
    if (thumbnail === undefined || gallery === undefined) {
      throw new Error('The fixture did not produce both a THUMBNAIL and a GALLERY association.');
    }

    return {
      slug: published.slug,
      productId: seeded.productId,
      thumbnailMediaId: thumbnail.id,
      galleryMediaId: gallery.id,
      assetIds: seeded.assetIds,
      updatedAt: published.updatedAt,
    };
  }

  function path(slug: string, mediaId: string, rendition: string): string {
    return `/api/public/products/${slug}/media/${mediaId}/${rendition}`;
  }

  describe('bytes and headers', () => {
    it('streams the exact THUMBNAIL object for the thumbnail rendition', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .responseType('blob')
        .expect(200);

      expect(Buffer.from(response.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(true);
    });

    it('streams the exact CATALOG_PREVIEW object for the catalog-preview rendition', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.galleryMediaId, 'catalog-preview'))
        .responseType('blob')
        .expect(200);

      expect(Buffer.from(response.body as Buffer).equals(PREVIEW_BYTES)).toBe(true);
      // Proves the rendition selected the derivative, not merely the asset.
      expect(Buffer.from(response.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(false);
    });

    it('sends the derivative content type, nosniff, inline and no-store', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .responseType('blob')
        .expect(200);

      expect(response.headers['content-type']).toContain('image/webp');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['content-disposition']).not.toContain('filename');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-length']).toBe(String(THUMBNAIL_BYTES.byteLength));
    });

    it('exposes no storage, bucket, checksum or provider metadata', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .responseType('blob')
        .expect(200);

      const headerText = JSON.stringify(response.headers).toLowerCase();
      for (const forbidden of [
        'etag',
        'x-amz',
        'minio',
        'derivatives/',
        'storage',
        'bucket',
        'sha256',
        'last-modified',
      ]) {
        expect(headerText).not.toContain(forbidden);
      }
      expect(headerText).not.toContain(ctx.derivativeKey(product.assetIds[0] ?? '', 'THUMBNAIL'));
    });

    it('returns raw bytes, never the JSON envelope', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .responseType('blob')
        .expect(200);

      // A wrapped binary would arrive as JSON describing the file.
      expect(response.headers['content-type']).not.toContain('application/json');
      expect(
        Buffer.from(response.body as Buffer)
          .subarray(0, 1)
          .toString(),
      ).not.toBe('{');
    });

    it('keeps canonical request-id correlation', async () => {
      const product = await publishedProduct();

      // The platform consumes `X-Request-ID` inbound and echoes it through
      // `meta.requestId` of the JSON envelope — there is no response header.
      // A binary success has no envelope by design, so the correlation is
      // observable on this route's error responses; the success path simply
      // must not break the inbound contract.
      await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .set('X-Request-ID', 'app2-t01-success')
        .responseType('blob')
        .expect(200);

      const missing = await ctx.api.http
        .get(path(product.slug, UNKNOWN_MEDIA_ID, 'thumbnail'))
        .set('X-Request-ID', 'app2-t01-correlated')
        .expect(404);

      expect(missing.body).toMatchObject({ meta: { requestId: 'app2-t01-correlated' } });
    });

    it('serves anonymously, with no cookie and no storage credential', async () => {
      const product = await publishedProduct();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .set('Cookie', '')
        .responseType('blob')
        .expect(200);

      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.headers)).not.toContain('Authorization');
    });
  });

  describe('publication changes take effect immediately', () => {
    it('stops serving after an unpublish and serves again after a republish', async () => {
      const product = await publishedProduct();
      const target = path(product.slug, product.thumbnailMediaId, 'thumbnail');

      await ctx.api.http.get(target).responseType('blob').expect(200);

      const unpublished = await asAdmin(ctx.api, adminId, () =>
        publication.unpublish({
          productId: product.productId,
          expectedUpdatedAt: new Date(product.updatedAt),
        }),
      );

      // Knowledge of a previously valid address must not survive the transition.
      await ctx.api.http.get(target).expect(404);

      const republished = await asAdmin(ctx.api, adminId, () =>
        publication.publish({
          productId: product.productId,
          expectedUpdatedAt: new Date(unpublished.updatedAt),
        }),
      );
      expect(republished.status).toBe('PUBLISHED');

      await ctx.api.http.get(target).responseType('blob').expect(200);
    });
  });

  describe('storage failures and privacy', () => {
    it('reports an object that vanished after a valid row as unavailable, not missing', async () => {
      const product = await publishedProduct();
      const assetId = product.assetIds[0] ?? '';
      await ctx.removeDerivative(assetId, 'THUMBNAIL');

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .expect(503);

      // The **status** is the actionable part and it survives; the *code* does
      // not. The canonical mapper replaces every 5xx code and message with the
      // generic server-fault pair, because a 5xx message may have been built
      // from an internal failure (recorded platform behaviour, `APP2-B01` §20).
      // So a client sees 503 + `INTERNAL_SERVER_ERROR`, which is exactly the
      // "retry later, and learn nothing" contract this route wants.
      expect(response.body).toMatchObject({ success: false, code: 'INTERNAL_SERVER_ERROR' });
      expect(response.status).toBe(503);
      const body = JSON.stringify(response.body);
      for (const forbidden of ['derivatives/', 'bucket', 'minio', '9000', 'NoSuchKey']) {
        expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }

      // Restored so the shared context stays usable for later cases.
      await ctx.putDerivative(assetId, 'THUMBNAIL', THUMBNAIL_BYTES);
    });

    it('keeps the object store unreachable without credentials', async () => {
      const product = await publishedProduct();
      const key = ctx.derivativeKey(product.assetIds[0] ?? '', 'THUMBNAIL');
      const endpoint = process.env['OBJECT_STORAGE_ENDPOINT'] ?? '';
      const bucket = process.env['OBJECT_STORAGE_DERIVATIVES_BUCKET'] ?? '';

      const status = await new Promise<number>((resolve, reject) => {
        httpGet(`${endpoint}/${bucket}/${key}`, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        }).once('error', reject);
      });

      // Anonymous direct object access is refused; only the app route serves it.
      expect(status).not.toBe(200);
      expect([400, 401, 403, 404]).toContain(status);
    });
  });

  describe('read-only guarantees', () => {
    it('writes no audit or outbox row and mutates nothing', async () => {
      const product = await publishedProduct();
      const before = await counts();

      await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'thumbnail'))
        .responseType('blob')
        .expect(200);
      await ctx.api.http
        .get(path(product.slug, product.galleryMediaId, 'catalog-preview'))
        .responseType('blob')
        .expect(200);
      await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'catalog-preview'))
        .expect(200);

      expect(await counts()).toStrictEqual(before);
    });

    async function counts(): Promise<Record<string, string>> {
      const [row] = (
        await ctx.api.database.client.db.execute(sql`
          select (select count(*) from audit_events)::text as audit,
                 (select count(*) from outbox_events)::text as outbox,
                 (select count(*) from products)::text as products,
                 (select count(*) from assets)::text as assets,
                 (select count(*) from asset_derivatives)::text as derivatives,
                 (select count(*) from product_media)::text as media
        `)
      ).rows as Record<string, string>[];
      return row ?? {};
    }
  });

  // Last on purpose: it binds the application's HTTP server to a real port so a
  // mid-response disconnect can be expressed, and hands the socket back at the
  // end. Running it earlier would leave every later supertest request sharing a
  // listener this test also tears down.
  describe('client disconnect', () => {
    it('destroys the upstream object stream when the client goes away', async () => {
      const product = await publishedProduct();
      const storage = ctx.api.app.get<{
        getObjectStream: (...args: never[]) => Promise<ObjectStreamResult>;
      }>(OBJECT_STORAGE);
      const original = storage.getObjectStream.bind(storage);
      const opened: ObjectStreamResult['body'][] = [];
      storage.getObjectStream = async (...args: never[]) => {
        const result = await original(...args);
        opened.push(result.body);
        return result;
      };

      // A real socket is required: supertest's in-process agent cannot express
      // a mid-response disconnect.
      const server = ctx.api.app.getHttpServer() as Server;
      const startedHere = !server.listening;
      if (startedHere) {
        await new Promise<void>((resolve) => server.listen(0, resolve));
      }
      const { port } = server.address() as AddressInfo;

      try {
        await new Promise<void>((resolve, reject) => {
          // Cleared in both outcomes; a dangling timer keeps the Jest worker
          // alive well past the assertion it was guarding.
          const deadline = setTimeout(
            () => reject(new Error('no response before the deadline')),
            20_000,
          );
          const settle = (): void => {
            clearTimeout(deadline);
            resolve();
          };
          const request = httpGet(
            { port, path: path(product.slug, product.thumbnailMediaId, 'thumbnail') },
            (response) => {
              // Headers are in; abandon the body mid-flight.
              response.destroy();
              request.destroy();
              settle();
            },
          );
          request.once('error', settle);
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(opened.length).toBeGreaterThan(0);
        expect(opened.every((stream) => stream.destroyed)).toBe(true);
      } finally {
        storage.getObjectStream = original;
        if (startedHere) {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      }
    }, 60_000);
  });
});

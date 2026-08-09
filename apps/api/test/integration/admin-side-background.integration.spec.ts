/**
 * Admin Side-background delivery against real PostgreSQL and real MinIO
 * (`APP3-B02A` §13).
 *
 * Everything runs through HTTP rather than the service, because the facts this
 * suite exists to prove are transport facts: the exact bytes, the exact headers,
 * that a success body is *not* the JSON envelope, and that an anonymous request
 * is refused by a guard that only exists in the HTTP layer.
 *
 * The load-bearing case is the **unpublished** Product. That is not an edge
 * case here — it is the whole reason `APP3-B02A` exists, because `APP3-A01`
 * authors placement before anything is published, and the public route
 * deliberately refuses exactly that. A suite that only proved a published
 * product works would prove the checkpoint unnecessary.
 *
 * The other half is refusal: a Side of a different Product, a Side with no
 * background, a missing object, and an anonymous caller. Each is asserted by
 * taking a request that worked and changing exactly one fact.
 */
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import { asAdmin, seedPublishableProduct } from '../support/product-publication-fixtures';
import {
  areaCommand,
  seedBackgroundAsset,
  sideCommand,
} from '../support/product-placement-fixtures';
import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
/** Synthetic throughout: no operator credential is read, used or created. */
const EMAIL = 'placement@example.test';
const PASSWORD = 'operator-secret-123';

/** Distinct content, so "the right object" is provable rather than plausible. */
const BACKGROUND_BYTES = Buffer.from('ADMIN-SIDE-BACKGROUND-'.repeat(64), 'utf8');
const NORMALIZED = 'NORMALIZED';

interface HttpResult {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

interface Seeded {
  readonly productId: string;
  readonly sideId: string;
  readonly backgroundAssetId: string;
  readonly path: string;
}

describe('Admin side-background delivery (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let cookie: string;
  let placement: ProductPlacementService;
  let publication: ProductPublicationService;
  let server: Server;
  let origin: string;
  let previousOrigins: string | undefined;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;

    ctx = await createPublicMediaContext('b02a-admin-side-background');
    const bootstrapped = await ctx.api.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    adminId = bootstrapped.adminId;
    ctx.api.app.get(LoginRateLimiter).reset();
    cookie = await login();

    placement = ctx.api.app.get(ProductPlacementService);
    publication = ctx.api.app.get(ProductPublicationService);

    server = ctx.api.app.getHttpServer() as Server;
    if (!server.listening) await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${String(address.port)}`;
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 300_000);

  async function login(): Promise<string> {
    const res = await ctx.api.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? (raw as string[]) : [];
    const session = cookies.find((value) => value.startsWith('adm_session='));
    if (session === undefined) throw new Error('login set no adm_session cookie');
    return session.split(';')[0] as string;
  }

  /** Raw `http.get` so the response body is bytes, never a parsed envelope. */
  function fetchPath(path: string, sessionCookie?: string): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
      const headers = sessionCookie === undefined ? {} : { Cookie: sessionCookie };
      httpGet(`${origin}${path}`, { headers }, (response) => {
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

  const authed = (path: string) => fetchPath(path, cookie);

  const rows = <T extends Record<string, unknown>>(statement: ReturnType<typeof sql>) =>
    ctx.api.database.client.db.execute(statement).then((result) => result.rows as T[]);

  const pathFor = (productId: string, sideId: string) =>
    `/api/admin/products/${productId}/sides/${sideId}/background`;

  /**
   * An **unpublished** Product with one active Side whose background object
   * really exists, and whose recorded `byte_size` is the size actually written.
   */
  async function seedDraft(
    options: { readonly bytes?: Buffer; readonly withBackground?: boolean } = {},
  ): Promise<Seeded> {
    const bytes = options.bytes ?? BACKGROUND_BYTES;
    const product = await asAdmin(ctx.api, adminId, () => seedPublishableProduct(ctx.api));
    const backgroundAssetId = await seedBackgroundAsset(ctx.api, {
      byteSize: bytes.length,
      widthPx: 2048,
      heightPx: 1536,
    });
    if (options.withBackground !== false) {
      await ctx.putDerivative(backgroundAssetId, NORMALIZED, bytes);
    }

    const view = await asAdmin(ctx.api, adminId, () =>
      placement.replace({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
        sides: [sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] })],
      }),
    );
    const sideId = view.sides[0]?.id ?? '';

    return {
      productId: product.productId,
      sideId,
      backgroundAssetId,
      path: pathFor(product.productId, sideId),
    };
  }

  describe('the case the public route refuses', () => {
    it('streams the exact object for an UNPUBLISHED product', async () => {
      const seeded = await seedDraft();

      const [status] = await rows<{ status: string }>(
        sql`select status from products where id = ${seeded.productId}`,
      );
      // The premise of the whole checkpoint, asserted rather than assumed.
      expect(status?.status).toBe('DRAFT');

      const response = await authed(seeded.path);
      expect(response.status).toBe(200);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(true);
    });

    it('is refused by the public route at the same moment', async () => {
      const seeded = await seedDraft();
      const [row] = await rows<{ slug: string }>(
        sql`select slug from products where id = ${seeded.productId}`,
      );

      const publicResponse = await fetchPath(
        `/api/public/products/${row?.slug ?? ''}/sides/front/background`,
      );

      // Both routes are live; they disagree only about publication, which is
      // exactly the difference B02A exists to create.
      expect(publicResponse.status).toBe(404);
    });

    it('keeps serving after the product is published', async () => {
      const seeded = await seedDraft();
      const [before] = await rows<{ updated_at: string | Date }>(
        sql`select updated_at from products where id = ${seeded.productId}`,
      );
      await asAdmin(ctx.api, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          // `execute` hands the column back untyped, so the Date is rebuilt
          // here rather than asserted — the service compares `getTime()`.
          expectedUpdatedAt: new Date(before?.updated_at ?? 0),
        }),
      );

      const response = await authed(seeded.path);
      expect(response.status).toBe(200);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(true);
    });
  });

  describe('headers and leakage', () => {
    it('sends the ruled headers and the reconciled length', async () => {
      const seeded = await seedDraft();
      const response = await authed(seeded.path);

      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['content-length']).toBe(String(BACKGROUND_BYTES.length));
      expect(String(response.headers['content-disposition'])).not.toContain('filename');
    });

    it('returns bytes, never a JSON envelope or a URL', async () => {
      const seeded = await seedDraft();
      const response = await authed(seeded.path);
      const asText = response.body.toString('utf8');

      expect(asText).not.toContain('"success"');
      expect(asText).not.toContain('http');
    });

    it('leaks no storage identity in any header', async () => {
      const seeded = await seedDraft();
      const response = await authed(seeded.path);
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
    });
  });

  describe('authorization', () => {
    it('refuses an anonymous caller', async () => {
      const seeded = await seedDraft();

      const response = await fetchPath(seeded.path);

      expect(response.status).toBe(401);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(false);
    });

    it('refuses a Side belonging to a different Product', async () => {
      const mine = await seedDraft();
      const theirs = await seedDraft();

      const response = await authed(pathFor(mine.productId, theirs.sideId));

      // Both ids are real; only the membership is wrong.
      expect(response.status).toBe(404);
      expect(response.body.equals(BACKGROUND_BYTES)).toBe(false);
    });

    it('refuses an unknown Product and an unknown Side identically', async () => {
      const seeded = await seedDraft();

      const unknownProduct = await authed(pathFor(newId(), seeded.sideId));
      const unknownSide = await authed(pathFor(seeded.productId, newId()));

      expect(unknownProduct.status).toBe(404);
      expect(unknownSide.status).toBe(404);

      // Indistinguishable, so the route cannot enumerate one Product's sides.
      // Compared on code and message rather than on the whole body: `meta`
      // carries a per-request id and timestamp, which differ on every response
      // and say nothing about which fact failed.
      const outcome = (raw: Buffer) => {
        const { code, message } = JSON.parse(raw.toString('utf8')) as {
          code: string;
          message: string;
        };
        return { code, message };
      };
      expect(outcome(unknownProduct.body)).toEqual(outcome(unknownSide.body));
      expect(outcome(unknownProduct.body).code).toBe('ADMIN_SIDE_BACKGROUND_NOT_FOUND');
    });

    it('rejects a malformed id before any query', async () => {
      const response = await authed('/api/admin/products/not-a-uuid/sides/also-not/background');

      expect(response.status).toBe(400);
    });
  });

  describe('storage failure', () => {
    it('reports a missing object as unavailable, never as not-found', async () => {
      const seeded = await seedDraft();
      await ctx.removeDerivative(seeded.backgroundAssetId, NORMALIZED);

      const response = await authed(seeded.path);

      // The row still says READY with a durable key, so 404 would tell the
      // operator their placement is broken when the fault is in storage.
      expect(response.status).toBe(503);
    });

    it('refuses when the stored object contradicts the recorded size', async () => {
      const seeded = await seedDraft();
      // The row keeps its original byte_size; the object becomes a different size.
      await ctx.putDerivative(seeded.backgroundAssetId, NORMALIZED, Buffer.from('short'));

      const response = await authed(seeded.path);

      expect(response.status).toBe(503);
      expect(response.body.toString('utf8')).not.toContain('short');
    });
  });

  describe('the route writes nothing', () => {
    it('mutates no row and no object', async () => {
      const seeded = await seedDraft();

      const countsBefore = await rows<Record<string, string>>(sql`
        select
          (select count(*) from products)          as products,
          (select count(*) from product_sides)     as sides,
          (select count(*) from embroidery_areas)  as areas,
          (select count(*) from assets)            as assets,
          (select count(*) from asset_derivatives) as derivatives,
          (select count(*) from audit_events)      as audits,
          (select count(*) from outbox_events)     as outbox
      `);
      const [sideBefore] = await rows<{ updated_at: Date }>(
        sql`select updated_at from product_sides where id = ${seeded.sideId}`,
      );

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await authed(seeded.path)).status).toBe(200);
      }

      const countsAfter = await rows<Record<string, string>>(sql`
        select
          (select count(*) from products)          as products,
          (select count(*) from product_sides)     as sides,
          (select count(*) from embroidery_areas)  as areas,
          (select count(*) from assets)            as assets,
          (select count(*) from asset_derivatives) as derivatives,
          (select count(*) from audit_events)      as audits,
          (select count(*) from outbox_events)     as outbox
      `);
      const [sideAfter] = await rows<{ updated_at: Date }>(
        sql`select updated_at from product_sides where id = ${seeded.sideId}`,
      );

      expect(countsAfter[0]).toEqual(countsBefore[0]);
      // No audit row and no outbox event: a read is not an event.
      expect(sideAfter?.updated_at).toEqual(sideBefore?.updated_at);

      // The object is still exactly what it was — a read never rewrites it.
      const again = await authed(seeded.path);
      expect(again.body.equals(BACKGROUND_BYTES)).toBe(true);
    });
  });
});

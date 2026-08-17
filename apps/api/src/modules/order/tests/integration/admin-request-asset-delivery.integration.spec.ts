/**
 * `APP5-B06` — Admin request-asset delivery, over real HTTP against PostgreSQL
 * (§19, §20).
 *
 * Three claims, and the suite is organised around them rather than around the
 * handler's branches:
 *
 * 1. an authenticated operator receives the exact stored bytes of an eligible,
 *    request-bound attachment, with the private headers;
 * 2. every association, eligibility and privacy miss is the *same* answer, and
 *    reaches the object store **zero** times;
 * 3. reading writes nothing.
 *
 * The storage-call counter is what makes claim 2 a proof rather than a
 * coincidence. A refusal that probed the provider first would still return 404
 * and would still pass a body assertion; only `storage.reads` shows that the
 * decision was made before the customer's object was addressed at all.
 */
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  binaryParser,
  contentRoute,
  createAdminRequestAssetContext,
  JPEG_BYTES,
  PNG_BYTES,
  WEBP_BYTES,
  type AdminRequestAssetTestContext,
} from './admin-request-asset-context';

describe('APP5-B06 — Admin private request-asset delivery', () => {
  let context: AdminRequestAssetTestContext;

  beforeAll(async () => {
    context = await createAdminRequestAssetContext('app5-b06-delivery');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  /** One bound, eligible attachment. The shape almost every case starts from. */
  async function seedBound(
    role = 'COP_IMAGE',
    asset: Parameters<AdminRequestAssetTestContext['seedAsset']>[1] = {},
  ): Promise<{ requestId: string; assetId: string; bytes: Buffer }> {
    const customerId = await context.seedCustomer();
    const requestId = await context.seedRequest(customerId);
    const seeded = await context.seedAsset(customerId, asset);
    await context.bindAsset(requestId, seeded.assetId, role);
    return { requestId, assetId: seeded.assetId, bytes: seeded.bytes };
  }

  function get(requestId: string, assetId: string) {
    return request(context.server())
      .get(contentRoute(requestId, assetId))
      .set('Cookie', context.adminCookie());
  }

  describe('success', () => {
    it('streams the exact stored bytes of a bound ACCEPTED COP_IMAGE JPEG', async () => {
      const bound = await seedBound('COP_IMAGE', {
        bytes: JPEG_BYTES,
        mimeType: 'image/jpeg',
      });

      const response = await get(bound.requestId, bound.assetId).buffer().parse(binaryParser);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(response.body).toEqual(JPEG_BYTES);
      expect(context.storage.reads).toHaveLength(1);
    });

    it('streams a bound ACCEPTED REFERENCE PNG, and a WebP under the same route', async () => {
      const png = await seedBound('REFERENCE', { bytes: PNG_BYTES, mimeType: 'image/png' });
      const pngResponse = await get(png.requestId, png.assetId).buffer().parse(binaryParser);

      expect(pngResponse.status).toBe(200);
      expect(pngResponse.headers['content-type']).toContain('image/png');
      expect(pngResponse.body).toEqual(PNG_BYTES);

      const webp = await seedBound('REFERENCE', { bytes: WEBP_BYTES, mimeType: 'image/webp' });
      const webpResponse = await get(webp.requestId, webp.assetId).buffer().parse(binaryParser);

      expect(webpResponse.status).toBe(200);
      expect(webpResponse.headers['content-type']).toContain('image/webp');
      expect(webpResponse.body).toEqual(WEBP_BYTES);
    });

    it('sends the persisted size and the private, non-sniffable headers', async () => {
      const bound = await seedBound();

      const response = await get(bound.requestId, bound.assetId).buffer().parse(binaryParser);

      expect(response.headers['content-length']).toBe(String(PNG_BYTES.length));
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
    });

    it('discloses no bucket, key, customer or challenge anywhere in the response', async () => {
      const customerId = await context.seedCustomer();
      const requestId = await context.seedRequest(customerId);
      const seeded = await context.seedAsset(customerId);
      await context.bindAsset(requestId, seeded.assetId, 'COP_IMAGE');

      const response = await get(requestId, seeded.assetId).buffer().parse(binaryParser);

      const headers = JSON.stringify(response.headers);
      expect(headers).not.toContain(seeded.storageKey);
      expect(headers).not.toContain('originals');
      expect(headers).not.toContain(customerId);
    });
  });

  describe('association and privacy — the same miss, and never a storage call', () => {
    it('refuses an asset asked for under the wrong request', async () => {
      const customerId = await context.seedCustomer();
      const owning = await context.seedRequest(customerId);
      const other = await context.seedRequest(customerId);
      const seeded = await context.seedAsset(customerId);
      await context.bindAsset(owning, seeded.assetId, 'COP_IMAGE');

      await expectSafeMiss(get(other, seeded.assetId));
    });

    it('refuses an asset bound to another request, identically', async () => {
      const first = await context.seedCustomer();
      const second = await context.seedCustomer();
      const theirRequest = await context.seedRequest(second);
      const mine = await context.seedRequest(first);
      const theirs = await context.seedAsset(second);
      await context.bindAsset(theirRequest, theirs.assetId, 'REFERENCE');

      await expectSafeMiss(get(mine, theirs.assetId));
    });

    it('refuses an unknown asset, an unknown request, and an unbound asset', async () => {
      const bound = await seedBound();
      const customerId = await context.seedCustomer();
      const unbound = await context.seedAsset(customerId);

      await expectSafeMiss(get(bound.requestId, UNKNOWN_ID));
      await expectSafeMiss(get(UNKNOWN_ID, bound.assetId));
      await expectSafeMiss(get(bound.requestId, unbound.assetId));
    });

    it('refuses an ATTACHMENT association even though the asset is eligible', async () => {
      const bound = await seedBound('ATTACHMENT');

      await expectSafeMiss(get(bound.requestId, bound.assetId));
    });
  });

  describe('eligibility — the same miss, and never a storage call', () => {
    it('refuses an INSPECTING asset', async () => {
      const bound = await seedBound('COP_IMAGE', { status: 'INSPECTING' });
      await expectSafeMiss(get(bound.requestId, bound.assetId));
    });

    it('refuses a REJECTED asset', async () => {
      const bound = await seedBound('COP_IMAGE', { status: 'REJECTED' });
      await expectSafeMiss(get(bound.requestId, bound.assetId));
    });

    it('refuses a tombstoned asset', async () => {
      const bound = await seedBound('COP_IMAGE', { status: 'DELETED', deleted: true });
      await expectSafeMiss(get(bound.requestId, bound.assetId));

      const pending = await seedBound('COP_IMAGE', { status: 'DELETION_PENDING' });
      await expectSafeMiss(get(pending.requestId, pending.assetId));
    });

    it('refuses an asset outside the customer-private upload lane', async () => {
      const wrongKind = await seedBound('REFERENCE', { kind: 'CATALOG_MEDIA' });
      await expectSafeMiss(get(wrongKind.requestId, wrongKind.assetId));

      const wrongClass = await seedBound('REFERENCE', { classification: 'PUBLIC' });
      await expectSafeMiss(get(wrongClass.requestId, wrongClass.assetId));
    });

    it('refuses an undeliverable persisted media type', async () => {
      const svg = await seedBound('REFERENCE', { mimeType: 'image/svg+xml' });
      await expectSafeMiss(get(svg.requestId, svg.assetId));

      const pdf = await seedBound('REFERENCE', { mimeType: 'application/pdf' });
      await expectSafeMiss(get(pdf.requestId, pdf.assetId));
    });

    it('answers a malformed address with a 400 and no storage call', async () => {
      const response = await request(context.server())
        .get(contentRoute('not-a-uuid', 'also-not-a-uuid'))
        .set('Cookie', context.adminCookie());

      expect(response.status).toBe(400);
      expect(context.storage.reads).toHaveLength(0);
    });
  });

  describe('provider failures — bounded, and never a partial body', () => {
    it('reports an authorized descriptor whose object is missing as unavailable', async () => {
      const bound = await seedBound('COP_IMAGE', { withoutObject: true });

      const response = await get(bound.requestId, bound.assetId);

      // Not a 404: the association exists and the row says ACCEPTED, so a
      // not-found would tell an operator the evidence was never submitted.
      expect(response.status).toBe(503);
      expect(context.storage.reads).toHaveLength(1);
    });

    it('refuses when the provider size contradicts the persisted size', async () => {
      const bound = await seedBound('COP_IMAGE', { persistedSizeBytes: PNG_BYTES.length + 99 });

      const response = await get(bound.requestId, bound.assetId).buffer().parse(binaryParser);

      expect(response.status).toBe(503);
      // No partial body: the stream is destroyed before the refusal.
      expect(response.body).not.toEqual(PNG_BYTES);
      expect(context.storage.openedBodies[0]?.destroyed).toBe(true);
    });
  });

  describe('Admin authentication', () => {
    it('refuses a caller with no session, without touching storage', async () => {
      const bound = await seedBound();

      const response = await request(context.server()).get(
        contentRoute(bound.requestId, bound.assetId),
      );

      expect(response.status).toBe(401);
      expect(context.storage.reads).toHaveLength(0);
    });

    it('refuses a token no session was ever minted for', async () => {
      const bound = await seedBound();

      const response = await request(context.server())
        .get(contentRoute(bound.requestId, bound.assetId))
        .set('Cookie', 'adm_session=not-a-minted-token');

      expect(response.status).toBe(401);
      expect(context.storage.reads).toHaveLength(0);
    });

    it('needs no mutation body guard: a safe GET with no body succeeds', async () => {
      const bound = await seedBound();

      const response = await get(bound.requestId, bound.assetId).buffer().parse(binaryParser);

      expect(response.status).toBe(200);
    });
  });

  describe('disconnect', () => {
    it('destroys the upstream body mid-stream when the operator hangs up', async () => {
      // Deliberately large *and* deliberately slow. A fixture Node can flush in
      // one tick has already ended by the time the abort arrives, and
      // `destroyed` is true after a normal end too — the first version of this
      // test passed for exactly that reason and proved nothing.
      const big = Buffer.concat([PNG_BYTES, Buffer.alloc(256 * 1024, 0x7a)]);
      const bound = await seedBound('COP_IMAGE', { bytes: big, chunkDelayMs: 20 });

      // A raw client rather than supertest: the socket has to be destroyed
      // *after the first body chunk lands*, and supertest's `abort()` on the
      // response event turned out to race the whole body to completion.
      await destroyAfterFirstChunk(contentRoute(bound.requestId, bound.assetId));

      // The abort travels socket → controller → provider stream. It is not
      // synchronous with the client's close, so this waits for the listener
      // rather than racing it.
      const body = () => context.storage.openedBodies[0];
      await waitFor(() => body()?.destroyed === true);

      expect(body()?.destroyed).toBe(true);
      // The distinguishing half: torn down *before* it ran out, so this is a
      // cleanup rather than a completed response being reported as one.
      expect(body()?.readableEnded).toBe(false);
    });
  });

  describe('zero write', () => {
    it('changes no request, asset, transition, note or outbox state', async () => {
      const bound = await seedBound();
      const before = await snapshot();

      const response = await get(bound.requestId, bound.assetId).buffer().parse(binaryParser);
      expect(response.status).toBe(200);

      expect(await snapshot()).toEqual(before);
    });
  });

  /**
   * Issues one authenticated GET and destroys the socket on the first body
   * chunk, then resolves once the server has seen the close.
   */
  async function destroyAfterFirstChunk(path: string): Promise<void> {
    const server = context.server();
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(0, resolve));
    }
    const { port } = server.address() as AddressInfo;

    await new Promise<void>((resolve) => {
      const outgoing = httpRequest(
        { port, path, method: 'GET', headers: { Cookie: context.adminCookie() } },
        (incoming) => {
          incoming.once('data', () => {
            outgoing.destroy();
            resolve();
          });
        },
      );
      outgoing.on('error', () => resolve());
      outgoing.end();
    });
  }

  /** Every private miss: the same status, the same code, zero storage calls. */
  async function expectSafeMiss(pending: request.Test): Promise<void> {
    const reads = context.storage.reads.length;
    const response = await pending;

    expect(response.status).toBe(404);
    expect((response.body as { code?: string }).code).toBe('REQUEST_ASSET_NOT_FOUND');
    expect(context.storage.reads).toHaveLength(reads);
  }

  /**
   * The APP5 state a read must not move.
   *
   * Narrow on purpose: the statuses and timestamps of the two rows a delivery
   * could plausibly touch, plus the row counts of the three append-only tables a
   * write would land in. Comparing whole tables would fail on nothing but noise.
   */
  async function snapshot(): Promise<unknown> {
    const { db } = context;
    const [requests, assets, transitions, notes, outbox] = await Promise.all([
      db.execute(sql`select id, status, updated_at from custom_requests order by id`),
      db.execute(sql`select id, status, updated_at from assets order by id`),
      db.execute(sql`select count(*)::int as n from custom_request_transitions`),
      db.execute(sql`select count(*)::int as n from request_moderation_notes`),
      db.execute(sql`select count(*)::int as n from outbox_events`),
    ]);
    return {
      requests: requests.rows,
      assets: assets.rows,
      transitions: transitions.rows,
      notes: notes.rows,
      outbox: outbox.rows,
    };
  }
});

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Polls a condition that a listener, not this test, is responsible for setting. */
async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

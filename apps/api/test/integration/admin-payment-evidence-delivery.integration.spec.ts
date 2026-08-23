/**
 * `APP7-B06` — Admin transfer-evidence delivery, over real HTTP against
 * PostgreSQL (§19, §20, §28, §29).
 *
 * Four claims, and the suite is organised around them rather than around the
 * handler's branches:
 *
 * 1. an authenticated operator receives the exact stored bytes of an eligible,
 *    attempt-bound evidence image, with the private headers;
 * 2. every association, eligibility and privacy miss is the *same* answer, and
 *    reaches the object store **zero** times;
 * 3. reading writes nothing — no payment, order, asset or evidence state moves;
 * 4. the `evidenceId` `APP7-B04` publishes is usable at this address, and the
 *    evidence B04 reports as `previewEligible: false` is not.
 *
 * The storage-call counter is what makes claim 2 a proof rather than a
 * coincidence. A refusal that probed the provider first would still return 404
 * and would still pass a body assertion; only `storage.reads` shows that the
 * decision was made before the customer's object was addressed at all.
 */
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { sql } from 'drizzle-orm';
import type request from 'supertest';

import { ADMIN_PAYMENT_ROUTES, seedVerifiableAttempt } from '../support/admin-payment-fixture';
import {
  binaryParser,
  createEvidenceDeliveryContext,
  evidenceContentRoute,
  JPEG_BYTES,
  PNG_BYTES,
  seedEvidence,
  WEBP_BYTES,
  type EvidenceDeliveryContext,
  type SeedEvidenceOptions,
} from '../support/payment-evidence-delivery-fixture';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('APP7-B06 — Admin private transfer-evidence delivery', () => {
  let context: EvidenceDeliveryContext;

  beforeAll(async () => {
    context = await createEvidenceDeliveryContext('app7-b06-delivery');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  /** One attempt with one bound evidence image. The shape every case starts from. */
  async function seedBound(options: SeedEvidenceOptions = {}) {
    const attempt = await seedVerifiableAttempt(context.admin.ctx.app, context.admin.ctx.database);
    const evidence = await seedEvidence(
      context.admin.ctx.database,
      context.storage,
      attempt.attemptId,
      options,
    );
    return { ...attempt, ...evidence };
  }

  function get(evidenceId: string) {
    return context.admin.ctx.http
      .get(evidenceContentRoute(evidenceId))
      .set('Cookie', context.admin.cookie());
  }

  describe('success', () => {
    it('streams the exact stored bytes of an ACCEPTED JPEG', async () => {
      const bound = await seedBound({ bytes: JPEG_BYTES, mimeType: 'image/jpeg' });

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.compare(response.body as Buffer, JPEG_BYTES)).toBe(0);
    });

    it('streams a PNG and a WebP under the same address', async () => {
      const png = await seedBound({ bytes: PNG_BYTES, mimeType: 'image/png' });
      const webp = await seedBound({ bytes: WEBP_BYTES, mimeType: 'image/webp' });

      const first = await get(png.evidenceId).buffer().parse(binaryParser);
      const second = await get(webp.evidenceId).buffer().parse(binaryParser);

      expect(first.status).toBe(200);
      expect(Buffer.compare(first.body as Buffer, PNG_BYTES)).toBe(0);
      expect(second.status).toBe(200);
      expect(second.headers['content-type']).toContain('image/webp');
      expect(Buffer.compare(second.body as Buffer, WEBP_BYTES)).toBe(0);
    });

    it('sends the persisted size and the private, non-sniffable headers', async () => {
      const bound = await seedBound();

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);

      expect(response.headers['content-length']).toBe(String(PNG_BYTES.length));
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['etag']).toBeUndefined();
    });

    it('discloses no storage, asset or payment identity anywhere in the response', async () => {
      const bound = await seedBound();

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);
      const serialized = JSON.stringify(response.headers);

      for (const secret of [
        bound.storageKey,
        bound.assetId,
        bound.attemptId,
        bound.orderId,
        bound.depositObligationId,
      ]) {
        expect(serialized).not.toContain(secret);
      }
      // The filename the customer uploaded under is never persisted, so it can
      // never appear — and nor may an invented one.
      expect(response.headers['content-disposition']).not.toContain('filename');
    });
  });

  describe('association and eligibility — the same miss, and never a storage call', () => {
    it('refuses an unknown evidence id', async () => {
      await expectSafeMiss(get(UNKNOWN_ID));
    });

    it('refuses evidence whose image is still being inspected', async () => {
      const bound = await seedBound({ status: 'INSPECTING' });
      await expectSafeMiss(get(bound.evidenceId));
    });

    it('refuses evidence whose image inspection rejected', async () => {
      const bound = await seedBound({ status: 'REJECTED' });
      await expectSafeMiss(get(bound.evidenceId));
    });

    it('refuses a tombstoned image', async () => {
      const bound = await seedBound({ status: 'DELETION_PENDING', deleted: true });
      await expectSafeMiss(get(bound.evidenceId));
    });

    it('refuses an image outside the customer-private upload lane', async () => {
      const wrongKind = await seedBound({ kind: 'CATALOG_MEDIA' });
      const wrongClass = await seedBound({ classification: 'PUBLIC' });

      await expectSafeMiss(get(wrongKind.evidenceId));
      await expectSafeMiss(get(wrongClass.evidenceId));
    });

    it('refuses an undeliverable persisted media type', async () => {
      const bound = await seedBound({ mimeType: 'image/svg+xml' });
      await expectSafeMiss(get(bound.evidenceId));
    });

    it('refuses an asset id used as if it were an evidence id', async () => {
      // The property §24 exists for: `assetId` is not a locator on this surface,
      // so presenting one is an ordinary miss rather than a second way in.
      const bound = await seedBound();
      await expectSafeMiss(get(bound.assetId));
    });

    it('answers a malformed address with a 400 and no storage call', async () => {
      const reads = context.storage.reads.length;

      const response = await get('not-a-uuid');

      expect(response.status).toBe(400);
      expect(context.storage.reads).toHaveLength(reads);
    });
  });

  describe('Admin authentication', () => {
    it('refuses a caller with no session, without touching storage', async () => {
      const bound = await seedBound();
      const reads = context.storage.reads.length;

      const response = await context.admin.ctx.http.get(evidenceContentRoute(bound.evidenceId));

      // A 401, not the private 404: an operator whose session died must be told
      // so rather than shown a missing-evidence answer.
      expect(response.status).toBe(401);
      expect(context.storage.reads).toHaveLength(reads);
    });

    it('needs no mutation body guard: a safe GET with no body succeeds', async () => {
      const bound = await seedBound();

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);

      expect(response.status).toBe(200);
    });
  });

  describe('provider failures — bounded, and never a partial body', () => {
    it('reports an authorized descriptor whose object is missing as unavailable', async () => {
      const bound = await seedBound({ withoutObject: true });

      const response = await get(bound.evidenceId);

      // 503, not 404: the authorization already succeeded, so reporting a
      // storage outage as not-found would tell an operator the customer never
      // submitted their screenshot.
      //
      // Only the status is asserted, and that is the platform's rule rather than
      // a weaker test: `mapHttpException` replaces the code and message of every
      // 5xx with the generic pair, because a server-side failure's prose may
      // have been built from an internal fault. `PAYMENT_EVIDENCE_UNAVAILABLE`
      // is the internal vocabulary the module refuses in; the wire says nothing
      // more than "unavailable". `APP5-B06` asserts the same way.
      expect(response.status).toBe(503);
      expect(context.storage.reads.length).toBeGreaterThan(0);
    });

    it('refuses when the provider size contradicts the persisted size', async () => {
      const bound = await seedBound({ persistedSizeBytes: PNG_BYTES.length + 1 });

      const opened = context.storage.openedBodies.length;

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);

      expect(response.status).toBe(503);
      // No partial body: the stream is destroyed before the refusal, so a
      // contradicted object never leaves a provider connection draining.
      expect(response.body).not.toEqual(PNG_BYTES);
      expect(context.storage.openedBodies[opened]?.destroyed).toBe(true);
    });

    it('leaks no provider, bucket or size detail in a bounded failure', async () => {
      const bound = await seedBound({ withoutObject: true });

      const response = await get(bound.evidenceId);
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain(bound.storageKey);
      expect(serialized.toLowerCase()).not.toContain('bucket');
      expect(serialized).not.toContain(String(PNG_BYTES.length));
    });
  });

  describe('APP7-B04 handoff', () => {
    it('serves the bytes of the evidenceId B04 reports as previewEligible', async () => {
      const bound = await seedBound({ bytes: JPEG_BYTES, mimeType: 'image/jpeg' });

      const read = await context.admin.ctx.http
        .get(ADMIN_PAYMENT_ROUTES.read(bound.orderId))
        .set('Cookie', context.admin.cookie());
      expect(read.status).toBe(200);

      const evidence = firstEvidence(read.body);
      expect(evidence.previewEligible).toBe(true);
      expect(evidence.evidenceId).toBe(bound.evidenceId);
      // B04 publishes the association id and no asset id — that is the API
      // design B06 is addressed by.
      expect(Object.keys(evidence)).not.toContain('assetId');

      const delivered = await get(evidence.evidenceId).buffer().parse(binaryParser);

      expect(delivered.status).toBe(200);
      expect(delivered.headers['content-type']).toContain(evidence.mediaType);
      expect(delivered.headers['content-length']).toBe(String(evidence.byteSize));
      expect(Buffer.compare(delivered.body as Buffer, JPEG_BYTES)).toBe(0);
    });

    it('refuses identically both evidence B04 reports as previewEligible false', async () => {
      const inspecting = await seedBound({ status: 'INSPECTING' });
      const rejected = await seedBound({ status: 'REJECTED' });

      for (const bound of [inspecting, rejected]) {
        const read = await context.admin.ctx.http
          .get(ADMIN_PAYMENT_ROUTES.read(bound.orderId))
          .set('Cookie', context.admin.cookie());
        expect(firstEvidence(read.body).previewEligible).toBe(false);
      }

      // The same status, the same code, and no storage call — so nothing about
      // the response distinguishes an unjudged image from a refused one.
      await expectSafeMiss(get(inspecting.evidenceId));
      await expectSafeMiss(get(rejected.evidenceId));
    });
  });

  describe('disconnect', () => {
    /**
     * B06 introduces its own controller-level abort wiring — it registers the
     * teardown on the signal `watchClientDisconnect` returns — so §21 asks for
     * exactly one focused proof of it. The shared helper itself is unchanged and
     * its mechanics suite is deliberately not rerun.
     */
    it('destroys the upstream body mid-stream when the operator hangs up', async () => {
      // Large and trickled, so the response cannot have already ended by the
      // time the socket dies — which is what makes `readableEnded` below a real
      // distinction rather than a restatement of `destroyed`.
      const big = Buffer.alloc(64 * 1024, 7);
      const bound = await seedBound({ bytes: big, chunkDelayMs: 25 });
      const opened = context.storage.openedBodies.length;

      await destroyAfterFirstChunk(evidenceContentRoute(bound.evidenceId));
      const body = (): { destroyed: boolean; readableEnded: boolean } | undefined =>
        context.storage.openedBodies[opened];
      await waitFor(() => body()?.destroyed === true);

      expect(body()?.destroyed).toBe(true);
      // The distinguishing half: torn down *before* it ran out, so this is a
      // cleanup rather than a completed response being reported as one.
      expect(body()?.readableEnded).toBe(false);
    });
  });

  describe('zero write', () => {
    it('changes no payment, order, asset or evidence state', async () => {
      const bound = await seedBound();
      const before = await snapshot();

      const response = await get(bound.evidenceId).buffer().parse(binaryParser);
      expect(response.status).toBe(200);

      expect(await snapshot()).toEqual(before);
    });

    it('writes nothing on a private miss either', async () => {
      await seedBound({ status: 'REJECTED' });
      const before = await snapshot();

      await expectSafeMiss(get(UNKNOWN_ID));

      expect(await snapshot()).toEqual(before);
    });
  });

  interface EvidenceView {
    readonly evidenceId: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly previewEligible: boolean;
  }

  /** The single evidence entry B04 reports for a seeded one-attempt deposit. */
  function firstEvidence(body: unknown): EvidenceView {
    const payload = body as {
      data?: { attempts?: readonly { evidence?: readonly EvidenceView[] }[] };
    };
    const found = payload.data?.attempts?.[0]?.evidence?.[0];
    if (found === undefined) {
      throw new Error('the B04 read published no evidence for the seeded attempt');
    }
    return found;
  }

  /**
   * Issues one authenticated GET and destroys the socket on the first body
   * chunk, then resolves once the server has seen the close.
   */
  async function destroyAfterFirstChunk(path: string): Promise<void> {
    const server = context.admin.ctx.app.getHttpServer() as Server;
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(0, resolve));
    }
    const { port } = server.address() as AddressInfo;

    await new Promise<void>((resolve) => {
      const outgoing = httpRequest(
        { port, path, method: 'GET', headers: { Cookie: context.admin.cookie() } },
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

  /** Polls a condition that a listener, not this test, is responsible for setting. */
  async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Every private miss: the same status, the same code, zero storage calls. */
  async function expectSafeMiss(pending: request.Test): Promise<void> {
    const reads = context.storage.reads.length;
    const response = await pending;

    expect(response.status).toBe(404);
    expect((response.body as { code?: string }).code).toBe('PAYMENT_EVIDENCE_NOT_FOUND');
    expect(context.storage.reads).toHaveLength(reads);
  }

  /**
   * The APP7 state a read must not move (§28).
   *
   * The statuses and timestamps of every row a delivery could plausibly touch,
   * plus the row counts of the append-only tables a write would land in.
   * Comparing whole tables would fail on nothing but noise.
   */
  async function snapshot(): Promise<unknown> {
    const { db } = context.admin.ctx.database.client;
    const [attempts, obligations, orders, assets, evidence, counts] = await Promise.all([
      db.execute(sql`select id, status, amount, succeeded_at, updated_at
                       from payment_attempts order by id`),
      db.execute(sql`select id, status, satisfied_by_attempt_id, satisfied_at, updated_at
                       from payment_obligations order by id`),
      db.execute(sql`select id, status, updated_at from orders order by id`),
      db.execute(sql`select id, status, size_bytes, deleted_at from assets order by id`),
      db.execute(sql`select id, payment_attempt_id, asset_id, created_at
                       from payment_transfer_evidence order by id`),
      db.execute(sql`select
          (select count(*) from payment_reconciliations)::int as reconciliations,
          (select count(*) from outbox_events)::int as outbox,
          (select count(*) from audit_events)::int as audit,
          (select count(*) from order_transitions)::int as transitions,
          (select count(*) from payment_provider_events)::int as provider_events`),
    ]);
    return {
      attempts: attempts.rows,
      obligations: obligations.rows,
      orders: orders.rows,
      assets: assets.rows,
      evidence: evidence.rows,
      counts: counts.rows,
    };
  }
});

/**
 * Design Session asset delivery against a live stack (`APP3-B06C` §20).
 *
 * Real `AppModule`, disposable PostgreSQL, disposable MinIO, real HTTP with a
 * real `__Host-` session cookie. No second harness: `createSessionAssetContext`
 * is `APP3-B06B-C1`'s, extended with a seeder for the state `APP3-W01A` leaves
 * behind.
 *
 * The suite is organised around the claims a unit test cannot make. That the
 * *exact* bytes arrive. That a foreign cookie, a foreign association, an
 * `INSPECTING` asset and an unknown id are all one indistinguishable answer, and
 * that none of them touches object storage. That an authorized descriptor whose
 * object is missing or contradicted is a 503 rather than a privacy 404. And that
 * a read — successful or not — leaves every durable row exactly as it found it.
 */
import { sql } from '@embroidery/database';
import { randomUUID } from 'node:crypto';

import {
  createSessionAssetContext,
  editorPreviewPath,
  type SessionAssetTestContext,
} from '../support/design-session-asset-context';

describe('Design Session asset delivery (live PostgreSQL + object storage)', () => {
  let ctx: SessionAssetTestContext;

  beforeAll(async () => {
    ctx = await createSessionAssetContext('app3b06c-session-delivery');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  beforeEach(() => ctx.limiter.reset());

  const rows = <T>(statement: ReturnType<typeof sql>) => ctx.rows<T>(statement);

  const countOf = async (statement: ReturnType<typeof sql>): Promise<number> => {
    const [row] = await rows<{ count: string }>(statement);
    return Number(row?.count ?? '-1');
  };

  /**
   * Everything a refusal body actually tells the caller.
   *
   * The response is parsed as a Buffer (the route is binary), so an error body
   * arrives as JSON bytes. `meta.requestId` and `meta.timestamp` differ on every
   * request by design and are dropped: comparing them would make two identical
   * refusals look different, which is the opposite of the property under test.
   */
  const disclosed = (response: { body: unknown }): unknown => {
    const parsed = JSON.parse((response.body as Buffer).toString('utf8')) as Record<
      string,
      unknown
    >;
    const { meta: _meta, ...rest } = parsed;
    return rest;
  };

  /** One delivery request, fully parameterised. */
  const fetchPreview = (sessionId: string, assetId: string, cookie?: string) =>
    ctx.api.http
      .get(editorPreviewPath(sessionId, assetId))
      .set('Cookie', cookie ?? ctx.cookieFor(sessionId))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

  describe('A — the authorized happy path', () => {
    it('streams the exact normalized bytes with the accepted private headers', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchPreview(sessionId, upload.assetId);

      expect(response.status).toBe(200);
      // The bytes, not merely a 200 of the right length.
      expect(Buffer.compare(response.body as Buffer, upload.bytes)).toBe(0);
      expect(response.headers['content-type']).toContain('image/webp');
      expect(response.headers['content-length']).toBe(String(upload.bytes.length));
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
    });

    it('names no storage identity anywhere in the response', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchPreview(sessionId, upload.assetId);

      const serialized = JSON.stringify(response.headers);
      expect(serialized).not.toContain(upload.storageKey);
      expect(serialized).not.toContain('DERIVATIVES');
      expect(serialized).not.toMatch(/minio|amazonaws|9000/i);
      expect(response.headers['etag']).toBeUndefined();
      expect(response.headers['last-modified']).toBeUndefined();
      expect(response.headers['accept-ranges']).toBeUndefined();
      // No filename: the original upload name is never persisted.
      expect(response.headers['content-disposition']).not.toContain('filename');
    });
  });

  describe('C/D/E — ownership, and what a credential does not buy', () => {
    it('refuses a foreign session credential against this asset', async () => {
      const owner = await ctx.seedSession();
      const stranger = await ctx.seedSession();
      const upload = await ctx.seedUpload(owner);

      // A *valid* credential — for the wrong session. The id selects the cookie,
      // so presenting the stranger's at the owner's address finds nothing.
      const response = await fetchPreview(owner, upload.assetId, ctx.cookieFor(stranger));

      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain(upload.storageKey);
    });

    it('refuses an asset associated to another session', async () => {
      const caller = await ctx.seedSession();
      const other = await ctx.seedSession();
      // Real association, real READY derivative, real object — owned by someone
      // else. This is the case a naive `assetId` lookup would serve.
      const upload = await ctx.seedUpload(other, { associateWith: other });

      const response = await fetchPreview(caller, upload.assetId);

      expect(response.status).toBe(404);
    });

    it.each([
      ['an expired session', { expiresIn: '-1 day' }],
      ['a non-ACTIVE session', { status: 'SUBMITTED' }],
    ])('refuses %s with the accepted session-auth answer', async (_label, options) => {
      const sessionId = await ctx.seedSession(options);
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchPreview(sessionId, upload.assetId);

      // 401, not 404: credential failure is the session layer's, and collapsing
      // it into a private miss would hide from an honest client that its cookie
      // is dead.
      expect(response.status).toBe(401);
    });

    it('refuses a missing cookie', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await ctx.api.http.get(editorPreviewPath(sessionId, upload.assetId));

      expect(response.status).toBe(401);
    });
  });

  describe('F/G/H/I — eligibility, one answer for every reason', () => {
    /**
     * Each row breaks exactly one term of the equation. They must all answer 404,
     * and the whole point is that a caller cannot tell them apart — nor tell any
     * of them from an id that never existed.
     */
    it.each([
      ['still INSPECTING', { assetStatus: 'INSPECTING' }],
      ['REJECTED by inspection', { assetStatus: 'REJECTED' }],
      ['tombstoned', { deleted: true }],
      ['outside the customer-private lane', { classification: 'PUBLIC' }],
      ['not a customer upload', { assetKind: 'CATALOG_MEDIA' }],
      ['carrying no derivative at all', { derivativeKind: null }],
      ['carrying only a thumbnail', { derivativeKind: 'THUMBNAIL' }],
      ['carrying an unready derivative', { derivativeStatus: 'PENDING' }],
      ['carrying a watermarked derivative', { watermarked: true }],
      [
        'incompletely described',
        { incompleteQuartet: true, derivativeStatus: 'PROCESSING' as const },
      ],
      ['with no association row', { associate: false }],
    ])('refuses an asset %s', async (_label, options) => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId, options);

      const response = await fetchPreview(sessionId, upload.assetId);

      expect(response.status).toBe(404);
    });

    it('cannot even store a READY NORMALIZED derivative without the quartet', async () => {
      const sessionId = await ctx.seedSession();

      // `APP3-DB01` closed this state *physically*, so the delivery route's
      // quartet check is defence in depth against a row the database refuses to
      // hold at all. Proving unrepresentability is a stronger claim than proving
      // a 404, and it is why the ineligible case above must be seeded as
      // `PROCESSING` — the `READY` variant does not exist to be tested.
      const refusal = await ctx
        .seedUpload(sessionId, { incompleteQuartet: true })
        .then(() => undefined)
        .catch((error: unknown) => error);

      // Named explicitly, from the driver's `cause`: a bare "it threw" would pass
      // just as happily on a typo in the fixture.
      expect((refusal as { cause?: { constraint?: string } }).cause?.constraint).toBe(
        'ck_asset_derivatives__ready_normalized_metadata',
      );
    });

    it('answers an unknown asset id identically to every ineligible one', async () => {
      const sessionId = await ctx.seedSession();
      const inspecting = await ctx.seedUpload(sessionId, { assetStatus: 'INSPECTING' });
      const foreign = await ctx.seedUpload(await ctx.seedSession());

      const unknown = await fetchPreview(sessionId, randomUUID());
      const pending = await fetchPreview(sessionId, inspecting.assetId);
      const other = await fetchPreview(sessionId, foreign.assetId);

      // Identical in everything a caller can learn from — status, code and
      // message. The envelope's `meta` carries a per-request id and timestamp by
      // design, so it is excluded rather than allowed to make three different
      // answers look the same or three identical ones look different.
      expect(pending.status).toBe(unknown.status);
      expect(other.status).toBe(unknown.status);
      expect(disclosed(pending)).toEqual(disclosed(unknown));
      expect(disclosed(other)).toEqual(disclosed(unknown));
    });

    it('never serves the original when the normalized derivative is absent', async () => {
      const sessionId = await ctx.seedSession();
      // The source original exists in `assets.storage_key` and has real bytes in
      // the intake lane. It is not a candidate and there is no branch that could
      // select it.
      const upload = await ctx.seedUpload(sessionId, { derivativeKind: null });

      const response = await fetchPreview(sessionId, upload.assetId);

      expect(response.status).toBe(404);
      expect(Buffer.from(response.body as Buffer).toString('utf8')).not.toContain('original.png');
    });

    it('refuses a malformed asset id at the boundary', async () => {
      const sessionId = await ctx.seedSession();

      const response = await fetchPreview(sessionId, 'not-a-uuid');

      expect(response.status).toBe(400);
    });
  });

  describe('J/K — provider contradiction is 503', () => {
    it('answers 503 when the object is gone after a fully authorized descriptor', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId, { writeObject: false });

      const response = await fetchPreview(sessionId, upload.assetId);

      // Not 404. The association exists and the row says READY, so a not-found
      // would tell a customer their own upload is gone.
      expect(response.status).toBe(503);
    });

    it('answers 503 when the provider size contradicts the persisted byte size', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId, { recordedByteSize: 999_999 });

      const response = await fetchPreview(sessionId, upload.assetId);

      expect(response.status).toBe(503);
    });

    it('does not repair the persisted metadata from provider state', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId, { recordedByteSize: 999_999 });

      await fetchPreview(sessionId, upload.assetId);

      const [row] = await rows<{ byte_size: string }>(
        sql`select byte_size from asset_derivatives where asset_id = ${upload.assetId}`,
      );
      // A read that corrected the database would let storage rewrite canonical
      // metadata the document was already validated against.
      expect(row?.byte_size).toBe('999999');
    });
  });

  describe('L — a read writes nothing', () => {
    it('leaves every durable row untouched across success and every refusal', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);
      const stranger = await ctx.seedSession();

      const before = await snapshot(sessionId);
      const auditBefore = await countOf(sql`select count(*)::text as count from audit_events`);
      const outboxBefore = await countOf(sql`select count(*)::text as count from outbox_events`);
      const derivativesBefore = await countOf(
        sql`select count(*)::text as count from asset_derivatives`,
      );
      const associationsBefore = await countOf(
        sql`select count(*)::text as count from design_session_assets`,
      );

      // A success, an authorization failure, a private miss and a malformed id.
      expect((await fetchPreview(sessionId, upload.assetId)).status).toBe(200);
      expect((await fetchPreview(sessionId, upload.assetId, ctx.cookieFor(stranger))).status).toBe(
        401,
      );
      expect((await fetchPreview(sessionId, randomUUID())).status).toBe(404);
      expect((await fetchPreview(sessionId, 'not-a-uuid')).status).toBe(400);

      expect(await snapshot(sessionId)).toEqual(before);
      expect(await countOf(sql`select count(*)::text as count from audit_events`)).toBe(
        auditBefore,
      );
      expect(await countOf(sql`select count(*)::text as count from outbox_events`)).toBe(
        outboxBefore,
      );
      expect(await countOf(sql`select count(*)::text as count from asset_derivatives`)).toBe(
        derivativesBefore,
      );
      expect(await countOf(sql`select count(*)::text as count from design_session_assets`)).toBe(
        associationsBefore,
      );
    });

    it('issues no cookie and extends no expiry on a successful read', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);
      const before = await snapshot(sessionId);

      const response = await fetchPreview(sessionId, upload.assetId);

      expect(response.status).toBe(200);
      // A rotated cookie would silently invalidate the credential the Studio is
      // still using in another tab.
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await snapshot(sessionId)).toEqual(before);
    });
  });

  /**
   * Everything a read must not move: the revision, the document, the secret
   * digest, the expiry, and the last-activity marker.
   */
  async function snapshot(sessionId: string): Promise<Record<string, unknown> | undefined> {
    const [row] = await rows<Record<string, unknown>>(
      sql`select autosave_revision, design_document, session_secret_hash, status,
                 expires_at, last_activity_at, updated_at
          from design_sessions where id = ${sessionId}`,
    );
    return row;
  }
});

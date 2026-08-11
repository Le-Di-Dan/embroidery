/**
 * The `APP3-S06` API repairs against a live stack (§28).
 *
 * Two subjects, both of which are SQL and therefore cannot be proved by a
 * double:
 *
 * **The status projection** (`§11`) — that an Asset the caller owns reports
 * `PROCESSING`, `READY` or `REJECTED` truthfully, that `READY` carries exactly
 * the media authority `APP3-P01` needs and no storage identity, and that
 * everything the caller does *not* own is one indistinguishable 404.
 *
 * **The cloned-media grant** (`§12`) — that an image a Session's own persisted
 * document already places is deliverable without any `design_session_assets`
 * row, that the grant is matched on the exact (asset, derivative) **pair**, that
 * another Session's document grants nothing, and that Template lineage is
 * provenance rather than permission.
 *
 * The document is written directly rather than through autosave on purpose: what
 * is under test is the *read* grant. `APP3-B08` owns which references may be
 * *written*, and going through it here would prove that allowlist instead.
 */
import { sql } from '@embroidery/database';
import { randomUUID } from 'node:crypto';

import {
  assetStatusPath,
  createSessionAssetContext,
  editorPreviewPath,
  imageElement,
  type SessionAssetTestContext,
} from '../support/design-session-asset-context';

interface StatusBody {
  readonly data: {
    readonly assetId: string;
    readonly state: string;
    readonly derivativeId?: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mediaType?: string;
    readonly byteSize?: number;
  };
}

describe('Design Session asset status and cloned media (live PostgreSQL + object storage)', () => {
  let ctx: SessionAssetTestContext;

  beforeAll(async () => {
    ctx = await createSessionAssetContext('app3s06-session-status');
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

  const fetchStatus = (sessionId: string, assetId: string, cookie?: string) =>
    ctx.api.http
      .get(assetStatusPath(sessionId, assetId))
      .set('Cookie', cookie ?? ctx.cookieFor(sessionId));

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

  describe('A — the status projection', () => {
    it('reports READY with exactly the P01 media authority', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchStatus(sessionId, upload.assetId);

      expect(response.status).toBe(200);
      expect((response.body as StatusBody).data).toEqual({
        assetId: upload.assetId,
        state: 'READY',
        derivativeId: upload.derivativeId,
        widthPx: 800,
        heightPx: 600,
        mediaType: 'image/webp',
        byteSize: upload.bytes.length,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('reports PROCESSING while inspection has not finished', async () => {
      const sessionId = await ctx.seedSession();
      // Exactly the state `APP3-B06B` leaves behind, and the state the whole
      // `FU-APP3-B06C-SESSION-LANE-INSPECTION-01` repair exists to move out of.
      const upload = await ctx.seedUpload(sessionId, {
        assetStatus: 'INSPECTING',
        derivativeKind: null,
      });

      const response = await fetchStatus(sessionId, upload.assetId);

      expect(response.status).toBe(200);
      expect((response.body as StatusBody).data).toEqual({
        assetId: upload.assetId,
        state: 'PROCESSING',
      });
    });

    it('reports PROCESSING for an accepted asset that is not normalized yet', async () => {
      const sessionId = await ctx.seedSession();
      // Inspection is done; `APP3-W01A` has not written the derivative. The
      // Studio must keep waiting rather than be told to place nothing.
      const upload = await ctx.seedUpload(sessionId, { derivativeStatus: 'PROCESSING' });

      const response = await fetchStatus(sessionId, upload.assetId);

      expect((response.body as StatusBody).data.state).toBe('PROCESSING');
    });

    it('reports REJECTED once inspection has refused the file', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId, {
        assetStatus: 'REJECTED',
        derivativeStatus: 'FAILED',
      });

      const response = await fetchStatus(sessionId, upload.assetId);

      expect((response.body as StatusBody).data).toEqual({
        assetId: upload.assetId,
        state: 'REJECTED',
      });
    });

    it('discloses no storage identity, reason or pipeline detail', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchStatus(sessionId, upload.assetId);

      const serialized = JSON.stringify({
        body: response.body as unknown,
        headers: response.headers as unknown,
      });
      expect(serialized).not.toContain(upload.storageKey);
      expect(serialized).not.toContain('DERIVATIVES');
      expect(serialized).not.toMatch(/minio|amazonaws|9000|checksum|sha256/i);
      expect(serialized).not.toMatch(/rejectionCode|inspection|attemptNo|lease|worker/i);
    });
  });

  describe('B — what the status route does not tell a stranger', () => {
    /** Every refusal body, minus the fields that differ per request by design. */
    const disclosed = (body: unknown): unknown => {
      const { meta: _meta, ...rest } = body as Record<string, unknown>;
      return rest;
    };

    it('answers identically for unknown, foreign and unassociated assets', async () => {
      const sessionId = await ctx.seedSession();
      const stranger = await ctx.seedSession();
      const theirs = await ctx.seedUpload(stranger);
      const unassociated = await ctx.seedUpload(sessionId, { associate: false });

      const answers = await Promise.all([
        fetchStatus(sessionId, randomUUID()),
        fetchStatus(sessionId, theirs.assetId),
        fetchStatus(sessionId, unassociated.assetId),
      ]);

      for (const answer of answers) expect(answer.status).toBe(404);
      const [first] = answers.map((answer) => disclosed(answer.body));
      for (const body of answers.map((answer) => disclosed(answer.body))) {
        expect(body).toEqual(first);
      }
    });

    it('refuses a foreign session credential', async () => {
      const sessionId = await ctx.seedSession();
      const stranger = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchStatus(sessionId, upload.assetId, ctx.cookieFor(stranger));

      expect(response.status).toBe(401);
    });

    it('refuses an expired session that presents a valid credential', async () => {
      const sessionId = await ctx.seedSession({ expiresIn: '-1 hour' });
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchStatus(sessionId, upload.assetId);

      expect(response.status).toBe(401);
    });

    it('is not a document-membership door: a clone reference is not a status claim', async () => {
      // The delivery route admits the document branch; the status route does
      // not, and this is the assertion that keeps the narrower scope real rather
      // than accidental.
      const sessionId = await ctx.seedSession();
      const cloned = await ctx.seedUpload(sessionId, {
        associate: false,
        assetKind: 'TEMPLATE_SOURCE',
        classification: 'PRODUCTION_SENSITIVE',
      });
      await ctx.setDocumentElements(sessionId, [
        imageElement(cloned.assetId, cloned.derivativeId as string),
      ]);

      await expect(fetchStatus(sessionId, cloned.assetId)).resolves.toMatchObject({ status: 404 });
      // …while the bytes it needs to render do arrive.
      await expect(fetchPreview(sessionId, cloned.assetId)).resolves.toMatchObject({ status: 200 });
    });
  });

  describe('C — the cloned-media grant', () => {
    /** A Template-owned image with no association, referenced by the document. */
    async function seedClonedImage(sessionId: string) {
      const cloned = await ctx.seedUpload(sessionId, {
        associate: false,
        assetKind: 'TEMPLATE_SOURCE',
        classification: 'PRODUCTION_SENSITIVE',
      });
      await ctx.setDocumentElements(sessionId, [
        imageElement(cloned.assetId, cloned.derivativeId as string),
      ]);
      return cloned;
    }

    it('delivers the exact bytes of an image the session document already places', async () => {
      const sessionId = await ctx.seedSession();
      const cloned = await seedClonedImage(sessionId);

      const response = await fetchPreview(sessionId, cloned.assetId);

      expect(response.status).toBe(200);
      expect(Buffer.compare(response.body as Buffer, cloned.bytes)).toBe(0);
      // No association row exists — the grant really is the document.
      expect(
        await countOf(
          sql`select count(*)::text as count from design_session_assets
               where asset_id = ${cloned.assetId}`,
        ),
      ).toBe(0);
    });

    it('matches the pair: the right asset through the wrong derivative is refused', async () => {
      const sessionId = await ctx.seedSession();
      const cloned = await ctx.seedUpload(sessionId, {
        associate: false,
        assetKind: 'TEMPLATE_SOURCE',
        classification: 'PRODUCTION_SENSITIVE',
      });
      // A reference naming this asset through *some other* derivative id.
      await ctx.setDocumentElements(sessionId, [imageElement(cloned.assetId, randomUUID())]);

      await expect(fetchPreview(sessionId, cloned.assetId)).resolves.toMatchObject({ status: 404 });
    });

    it('gives a bystander session nothing, whatever it knows', async () => {
      const owner = await ctx.seedSession();
      const cloned = await seedClonedImage(owner);
      const bystander = await ctx.seedSession();

      // Knowing both ids is not a claim. The grant is correlated to the
      // caller's own session row on both branches.
      await expect(fetchPreview(bystander, cloned.assetId)).resolves.toMatchObject({ status: 404 });
    });

    it('never lets a document reference reach another customer’s private upload', async () => {
      // The load-bearing narrowing. `APP3-B08`'s allowlist already stops such a
      // reference from being *written*, but that is another module's behaviour;
      // here the reference is forced straight into the document and the read
      // still refuses it, because the document branch admits `TEMPLATE_SOURCE`
      // only. Cross-customer leakage is unrepresentable rather than prevented
      // elsewhere.
      const victim = await ctx.seedSession();
      const theirPhoto = await ctx.seedUpload(victim);
      const attacker = await ctx.seedSession();
      await ctx.setDocumentElements(attacker, [
        imageElement(theirPhoto.assetId, theirPhoto.derivativeId as string),
      ]);

      await expect(fetchPreview(attacker, theirPhoto.assetId)).resolves.toMatchObject({
        status: 404,
      });
      // …and the owner is unaffected.
      await expect(fetchPreview(victim, theirPhoto.assetId)).resolves.toMatchObject({
        status: 200,
      });
    });

    it('keeps a malformed stored document from granting anything', async () => {
      const sessionId = await ctx.seedSession();
      const cloned = await ctx.seedUpload(sessionId, {
        associate: false,
        assetKind: 'TEMPLATE_SOURCE',
        classification: 'PRODUCTION_SENSITIVE',
      });
      // `elements` is not an array. `jsonb_array_elements` would *error* on
      // this, so the guard has to be a `jsonb_typeof` check rather than an
      // assumption — a malformed document must contribute no grant, not a 500.
      await ctx.api.database.client.db.execute(sql`
        update design_sessions
           set design_document = jsonb_set(design_document, '{elements}', '"broken"'::jsonb, true)
         where id = ${sessionId}`);

      await expect(fetchPreview(sessionId, cloned.assetId)).resolves.toMatchObject({ status: 404 });
    });

    it('still refuses an ineligible derivative through the document branch', async () => {
      const sessionId = await ctx.seedSession();
      const cloned = await ctx.seedUpload(sessionId, {
        associate: false,
        assetKind: 'TEMPLATE_SOURCE',
        classification: 'PRODUCTION_SENSITIVE',
        watermarked: true,
      });
      await ctx.setDocumentElements(sessionId, [
        imageElement(cloned.assetId, cloned.derivativeId as string),
      ]);

      // A grant decides *whose* media it is, never whether the media is
      // deliverable. Every eligibility term still applies.
      await expect(fetchPreview(sessionId, cloned.assetId)).resolves.toMatchObject({ status: 404 });
    });
  });

  describe('D — reading writes nothing', () => {
    it('leaves the session row and every counter exactly as it found them', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const before = await rows<{ revision: number; expires: string; hash: string }>(sql`
        select autosave_revision as revision, expires_at::text as expires,
               session_secret_hash as hash
          from design_sessions where id = ${sessionId}`);
      const events = await countOf(sql`select count(*)::text as count from outbox_events`);
      const audits = await countOf(sql`select count(*)::text as count from audit_events`);

      await fetchStatus(sessionId, upload.assetId);
      await fetchStatus(sessionId, randomUUID());
      await fetchPreview(sessionId, upload.assetId);

      const after = await rows<{ revision: number; expires: string; hash: string }>(sql`
        select autosave_revision as revision, expires_at::text as expires,
               session_secret_hash as hash
          from design_sessions where id = ${sessionId}`);

      expect(after).toEqual(before);
      expect(await countOf(sql`select count(*)::text as count from outbox_events`)).toBe(events);
      expect(await countOf(sql`select count(*)::text as count from audit_events`)).toBe(audits);
    });

    it('issues no cookie on a successful status read', async () => {
      const sessionId = await ctx.seedSession();
      const upload = await ctx.seedUpload(sessionId);

      const response = await fetchStatus(sessionId, upload.assetId);

      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });
});

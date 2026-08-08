/**
 * Design Session autosave against live PostgreSQL (`APP3-B08` §12).
 *
 * The unit suite proves which documents are saveable. This proves what the
 * database actually does with one — and above all that the compare-and-set is a
 * real single-winner CAS, not a read-then-write that merely looks like one under
 * a test that never races it.
 *
 * The race case runs ten iterations inside a single invocation. Repeating the
 * whole Jest run would only ever demonstrate that the suite is flaky or not;
 * looping in-process is what actually samples the interleaving.
 */
import { sql } from '@embroidery/database';

import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '@embroidery/design-document';

import { DesignSessionRateLimiter } from '../../src/modules/design/infrastructure/rate-limit/design-session-rate-limiter';
import {
  createAutosaveContext,
  DESIGN_SESSION_TEST_ORIGIN,
  PLACEMENT_GEOMETRY,
  type AutosaveTestContext,
  type SeededSession,
} from '../support/design-session-autosave-context';

const g = PLACEMENT_GEOMETRY;

describe('Design Session autosave (live PostgreSQL)', () => {
  let ctx: AutosaveTestContext;

  beforeAll(async () => {
    ctx = await createAutosaveContext('app3b08-autosave');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  /** The mutation budget is 30/minute; without this a long suite reports 429. */
  const resetLimiter = () => ctx.api.app.get(DesignSessionRateLimiter).reset();

  beforeEach(() => resetLimiter());

  const rows = <T>(statement: ReturnType<typeof sql>) => ctx.rows<T>(statement);

  const placementOf = (session: SeededSession) => ({
    productSideId: session.productSideId,
    embroideryAreaId: session.embroideryAreaId,
    canvasWidthPx: g.canvasWidthPx,
    canvasHeightPx: g.canvasHeightPx,
    physicalWidthMm: g.physicalWidthMm,
    physicalHeightMm: g.physicalHeightMm,
    pxPerMm: g.pxPerMm,
  });

  const documentFor = (session: SeededSession, elements: readonly unknown[] = []) => ({
    schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    placement: placementOf(session),
    elements,
  });

  const shapeAt = (x: number) => ({
    id: 'shape-1',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x, y: 200, width: 100, height: 80, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    shape: 'rectangle',
    fill: '#101010',
    stroke: '#000000',
    strokeWidthPx: 2,
  });

  const imageOf = (assetId: string, derivativeId: string) => ({
    id: 'image-1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 150, y: 200, width: 100, height: 80, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    assetId,
    derivativeId,
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
  });

  const autosave = (session: SeededSession, expectedRevision: number, document: unknown) =>
    ctx.api.http
      .put(`/api/public/design-sessions/${session.sessionId}/document`)
      .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', ctx.cookieFor(session))
      .send({ expectedRevision, document });

  const stateOf = async (sessionId: string) => {
    const [row] = await rows<{
      autosave_revision: number;
      design_document: Record<string, unknown>;
      document_schema_version: number;
      expires_at: string;
      session_secret_hash: string;
      status: string;
    }>(sql`select autosave_revision, design_document, document_schema_version, expires_at,
                  session_secret_hash, status from design_sessions where id = ${sessionId}`);
    return row!;
  };

  const eventCount = async (): Promise<number> => {
    const [row] = await rows<{ count: string }>(
      sql`select count(*)::text as count from outbox_events`,
    );
    return Number(row?.count ?? '-1');
  };

  describe('a successful save', () => {
    it('persists the canonical document and advances the revision exactly once', async () => {
      const session = await ctx.seedSession();
      const before = await stateOf(session.sessionId);
      const events = await eventCount();

      const response = await autosave(session, 0, documentFor(session, [shapeAt(150)])).expect(200);
      const view = (response.body as { data: { revision: number; document: unknown } }).data;

      const after = await stateOf(session.sessionId);
      expect(after.autosave_revision).toBe(1);
      expect(view.revision).toBe(1);
      expect(after.document_schema_version).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
      expect((after.design_document as { elements: unknown[] }).elements).toHaveLength(1);
      // The response is the persisted truth, not an echo of the request.
      expect(view.document).toEqual(after.design_document);

      // Autosave never extends the lifetime and never touches the credential.
      expect(after.expires_at).toEqual(before.expires_at);
      expect(after.session_secret_hash).toBe(before.session_secret_hash);
      expect(after.status).toBe('ACTIVE');
      // And it is not an event-producing operation.
      expect(await eventCount()).toBe(events);
    });

    it('issues no cookie', async () => {
      const session = await ctx.seedSession();
      const response = await autosave(session, 0, documentFor(session)).expect(200);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('stores the quantized canonical form, not the caller object', async () => {
      const session = await ctx.seedSession();
      const raw = documentFor(session, [shapeAt(150.000000004)]);
      await autosave(session, 0, raw).expect(200);
      const after = await stateOf(session.sessionId);
      const element = (after.design_document as { elements: { transform: { x: number } }[] })
        .elements[0];
      expect(element?.transform.x).toBe(150);
    });

    it('advances sequentially: 0 → 1 → 2', async () => {
      const session = await ctx.seedSession();
      await autosave(session, 0, documentFor(session, [shapeAt(150)])).expect(200);
      await autosave(session, 1, documentFor(session, [shapeAt(160)])).expect(200);
      const after = await stateOf(session.sessionId);
      expect(after.autosave_revision).toBe(2);
      const element = (after.design_document as { elements: { transform: { x: number } }[] })
        .elements[0];
      expect(element?.transform.x).toBe(160);
    });

    it('accepts an image this session uploaded', async () => {
      const session = await ctx.seedSession();
      const media = await ctx.seedSessionImage(session.sessionId);
      await autosave(
        session,
        0,
        documentFor(session, [imageOf(media.assetId, media.derivativeId)]),
      ).expect(200);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(1);
    });
  });

  describe('a stale save', () => {
    it('is refused with 409 and changes nothing', async () => {
      const session = await ctx.seedSession();
      await autosave(session, 0, documentFor(session, [shapeAt(150)])).expect(200);
      const before = await stateOf(session.sessionId);
      const events = await eventCount();

      await autosave(session, 0, documentFor(session, [shapeAt(300)])).expect(409);

      const after = await stateOf(session.sessionId);
      expect(after.autosave_revision).toBe(before.autosave_revision);
      expect(after.design_document).toEqual(before.design_document);
      expect(after.expires_at).toEqual(before.expires_at);
      expect(await eventCount()).toBe(events);
    });

    it('refuses a revision from the future just as firmly', async () => {
      const session = await ctx.seedSession();
      await autosave(session, 7, documentFor(session)).expect(409);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });
  });

  describe('authorization', () => {
    it('refuses a foreign session cookie and mutates nothing', async () => {
      const mine = await ctx.seedSession();
      const foreign = await ctx.seedSession();
      await ctx.api.http
        .put(`/api/public/design-sessions/${mine.sessionId}/document`)
        .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', ctx.cookieFor(foreign))
        .send({ expectedRevision: 0, document: documentFor(mine) })
        .expect(401);

      expect((await stateOf(mine.sessionId)).autosave_revision).toBe(0);
      expect((await stateOf(foreign.sessionId)).autosave_revision).toBe(0);
    });

    it('refuses an expired session', async () => {
      const session = await ctx.seedSession({ expiresIn: '-1 day' });
      await autosave(session, 0, documentFor(session)).expect(401);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });

    it('refuses a terminal session', async () => {
      const session = await ctx.seedSession({ status: 'EXPIRED' });
      await autosave(session, 0, documentFor(session)).expect(401);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });

    it('refuses a cross-site request before reading the body', async () => {
      const session = await ctx.seedSession();
      await ctx.api.http
        .put(`/api/public/design-sessions/${session.sessionId}/document`)
        .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Cookie', ctx.cookieFor(session))
        .send({ expectedRevision: 0, document: documentFor(session) })
        .expect(403);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });
  });

  describe('an invalid document', () => {
    const refusedWithoutMutation = async (
      session: SeededSession,
      document: unknown,
      status = 422,
    ) => {
      const before = await stateOf(session.sessionId);
      await autosave(session, before.autosave_revision, document).expect(status);
      const after = await stateOf(session.sessionId);
      expect(after.autosave_revision).toBe(before.autosave_revision);
      expect(after.design_document).toEqual(before.design_document);
    };

    it('refuses a structurally invalid document', async () => {
      const session = await ctx.seedSession();
      await refusedWithoutMutation(session, {
        schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      });
    });

    it('refuses a future schema version', async () => {
      const session = await ctx.seedSession();
      await refusedWithoutMutation(session, { ...documentFor(session), schemaVersion: 99 });
    });

    it('refuses a tampered placement identity', async () => {
      const session = await ctx.seedSession();
      const other = await ctx.seedSession();
      await refusedWithoutMutation(session, {
        ...documentFor(session),
        placement: { ...placementOf(session), productSideId: other.productSideId },
      });
    });

    it('refuses a tampered canvas scale', async () => {
      const session = await ctx.seedSession();
      await refusedWithoutMutation(session, {
        ...documentFor(session),
        placement: { ...placementOf(session), pxPerMm: 10 },
      });
    });

    it('refuses a document outside the embroidery area', async () => {
      const session = await ctx.seedSession();
      await refusedWithoutMutation(session, documentFor(session, [shapeAt(950)]));
    });

    it('refuses an image belonging to another session', async () => {
      const mine = await ctx.seedSession();
      const theirs = await ctx.seedSession();
      const media = await ctx.seedSessionImage(theirs.sessionId);
      // The derivative is real, READY and NORMALIZED. It is refused purely
      // because it is not in *this* session's allowlist.
      await refusedWithoutMutation(
        mine,
        documentFor(mine, [imageOf(media.assetId, media.derivativeId)]),
      );
    });

    it('refuses a derivative that is not NORMALIZED/READY', async () => {
      const session = await ctx.seedSession();
      const processing = await ctx.seedSessionImage(session.sessionId, { status: 'PROCESSING' });
      await refusedWithoutMutation(
        session,
        documentFor(session, [imageOf(processing.assetId, processing.derivativeId)]),
      );
    });

    it('cannot even be given an unmeasured editor-safe derivative to place', async () => {
      const session = await ctx.seedSession();
      // The API-level "unmeasured" branch is covered by the unit suite. Live,
      // the case is *unreachable* for the eligible kind: `APP3-DB01`'s CHECK
      // refuses a NORMALIZED/READY row without the full metadata quartet, so the
      // database is what guarantees a placeable derivative was measured.
      const error: unknown = await ctx
        .seedSessionImage(session.sessionId, { measured: false })
        .then(() => undefined)
        .catch((reason: unknown) => reason);
      expect(error).toBeDefined();
      // Drizzle wraps the driver error, so the constraint name lives on the
      // cause rather than the wrapper's own message.
      const cause = (error as { cause?: { constraint?: string } }).cause;
      expect(cause?.constraint).toBe('ck_asset_derivatives__ready_normalized_metadata');
    });

    it('refuses a body missing expectedRevision with 400, before any authority runs', async () => {
      const session = await ctx.seedSession();
      await ctx.api.http
        .put(`/api/public/design-sessions/${session.sessionId}/document`)
        .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', ctx.cookieFor(session))
        .send({ document: documentFor(session) })
        .expect(400);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });

    it('refuses a fractional revision with 400', async () => {
      const session = await ctx.seedSession();
      await autosave(session, 1.5, documentFor(session)).expect(400);
      expect((await stateOf(session.sessionId)).autosave_revision).toBe(0);
    });
  });

  describe('concurrency', () => {
    it('has exactly one winner per race, ten times', async () => {
      const session = await ctx.seedSession();

      for (let iteration = 0; iteration < 10; iteration += 1) {
        // Each iteration spends two of the 30/minute budget, so it is reset per
        // iteration; the race, not the budget, is under test.
        resetLimiter();

        const expected = iteration;
        const left = 150 + iteration;
        const right = 300 + iteration;

        const [a, b] = await Promise.all([
          autosave(session, expected, documentFor(session, [shapeAt(left)])),
          autosave(session, expected, documentFor(session, [shapeAt(right)])),
        ]);

        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([200, 409]);

        const after = await stateOf(session.sessionId);
        expect(after.autosave_revision).toBe(expected + 1);

        // The persisted document belongs to the winner, whole — never a blend.
        const element = (after.design_document as { elements: { transform: { x: number } }[] })
          .elements[0];
        const winner = a.status === 200 ? left : right;
        expect(element?.transform.x).toBe(winner);
      }
    }, 300_000);
  });

  describe('B07 interoperability', () => {
    it('resume observes the saved document and revision without extending expiry', async () => {
      const session = await ctx.seedSession();
      await autosave(session, 0, documentFor(session, [shapeAt(170)])).expect(200);
      const saved = await stateOf(session.sessionId);

      const response = await ctx.api.http
        .post(`/api/public/design-sessions/${session.sessionId}/resume`)
        .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', ctx.cookieFor(session))
        .expect(200);

      const view = (
        response.body as {
          data: { revision: number; document: unknown; expiresAt: string };
        }
      ).data;
      expect(view.revision).toBe(1);
      expect(view.document).toEqual(saved.design_document);
      expect(new Date(view.expiresAt).toISOString()).toBe(new Date(saved.expires_at).toISOString());
    });
  });
});

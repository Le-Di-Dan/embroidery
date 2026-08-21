/**
 * `APP6-B07` §17 — the Admin submitted-design read, end to end.
 *
 * `GET /api/admin/custom-requests/{requestId}/submitted-design`, driven through
 * the real guard against a real database. The contract suite proves what the
 * document says; this proves what the route does, and in particular the four
 * things B07 exists to make true:
 *
 * - the source is selected by the request's **own** `submitted_session_id` and
 *   by nothing else;
 * - a session belonging to another request is unreachable, not merely unused;
 * - every absence — no pointer, a purged row, a row that is no longer submitted
 *   evidence — is a successful empty read rather than an error;
 * - the read writes nothing, anywhere.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  codeOf,
  createSubmittedDesignContext,
  dataOf,
  ROUTE,
  SECRET_MARKER,
  type SeededPlacement,
  type SubmittedDesignTestContext,
} from './submitted-design-context';

interface SubmittedDesignPayload {
  readonly submittedDesign: {
    readonly sessionId: string;
    readonly document: unknown;
    readonly documentSchemaVersion: number;
    readonly revision: number;
  } | null;
}

/** A recognisable document, so "the *pointed* one came back" is observable. */
const submittedDocument = (marker: string): Record<string, unknown> => ({
  schemaVersion: 1,
  placement: {
    productSideId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
    embroideryAreaId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
    canvasWidthPx: 1000,
    canvasHeightPx: 1200,
    physicalWidthMm: 400,
    physicalHeightMm: 480,
    pxPerMm: 2.5,
  },
  elements: [{ kind: 'TEXT', id: marker, text: marker }],
});

describe('APP6-B07 Admin submitted-design read (integration)', () => {
  let context: SubmittedDesignTestContext;
  let placement: SeededPlacement;
  let customerId: string;

  beforeAll(async () => {
    context = await createSubmittedDesignContext('app6-b07-submitted-design');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
    placement = await context.seedPlacement();
    customerId = await context.seedCustomer();
  });

  function read(requestId: string) {
    return request(context.server())
      .get(ROUTE.submittedDesign(requestId))
      .set('Cookie', context.adminCookie());
  }

  /**
   * One catalog request whose session is genuinely its own: the request points
   * at the session and the session points back, which is the pair every
   * successful read requires.
   */
  async function seedSubmittedPair(options: {
    readonly marker: string;
    readonly revision: number;
  }) {
    const requestId = await context.seedRequest({ customerId, placement, status: 'DIGITIZING' });
    const sessionId = await context.seedSession({
      placement,
      submittedRequestId: requestId,
      document: submittedDocument(options.marker),
      revision: options.revision,
    });
    await context.rows(
      sql`update custom_requests set submitted_session_id = ${sessionId} where id = ${requestId}`,
    );
    return { requestId, sessionId };
  }

  describe('authorization', () => {
    it('refuses a caller with no Admin session', async () => {
      const { requestId } = await seedSubmittedPair({ marker: 'unauthenticated', revision: 1 });

      const response = await request(context.server()).get(ROUTE.submittedDesign(requestId));

      expect(response.status).toBe(401);
    });

    it('refuses a token no session was ever minted for', async () => {
      const { requestId } = await seedSubmittedPair({ marker: 'forged', revision: 1 });

      const response = await request(context.server())
        .get(ROUTE.submittedDesign(requestId))
        .set('Cookie', 'adm_session=not-a-token-anyone-issued');

      expect(response.status).toBe(401);
    });

    it('accepts no session id from the caller — the path has no such segment', async () => {
      const { sessionId } = await seedSubmittedPair({ marker: 'by-session', revision: 1 });

      // The only address B07 publishes is the request's. Addressing the session
      // directly is not a forbidden request; it is not a route at all.
      const response = await request(context.server())
        .get(`/api/admin/design-sessions/${sessionId}/submitted-design`)
        .set('Cookie', context.adminCookie());

      expect(response.status).toBe(404);
    });
  });

  describe('the catalog source', () => {
    it('returns the exact pointed document, its schema version and its revision', async () => {
      const { requestId, sessionId } = await seedSubmittedPair({
        marker: 'canonical',
        revision: 7,
      });

      const response = await read(requestId).expect(200);
      const payload = dataOf<SubmittedDesignPayload>(response);

      expect(payload.submittedDesign).not.toBeNull();
      expect(payload.submittedDesign?.sessionId).toBe(sessionId);
      expect(payload.submittedDesign?.document).toEqual(submittedDocument('canonical'));
      expect(payload.submittedDesign?.documentSchemaVersion).toBe(1);
      expect(payload.submittedDesign?.revision).toBe(7);
    });

    it('sends Cache-Control: no-store', async () => {
      const { requestId } = await seedSubmittedPair({ marker: 'no-store', revision: 1 });

      const response = await read(requestId).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('returns the request’s own session when another submitted session exists', async () => {
      const mine = await seedSubmittedPair({ marker: 'mine', revision: 2 });
      const theirs = await seedSubmittedPair({ marker: 'theirs', revision: 9 });

      const payload = dataOf<SubmittedDesignPayload>(await read(mine.requestId).expect(200));

      expect(payload.submittedDesign?.sessionId).toBe(mine.sessionId);
      expect(payload.submittedDesign?.sessionId).not.toBe(theirs.sessionId);
      expect(JSON.stringify(payload)).not.toContain('theirs');
      expect(payload.submittedDesign?.revision).toBe(2);
    });

    it('exposes no secret, storage key or session credential', async () => {
      const { requestId } = await seedSubmittedPair({ marker: 'redaction', revision: 1 });

      const response = await read(requestId).expect(200);
      const serialized = JSON.stringify(response.body);

      // The seeded `session_secret_hash` and the placement background's storage
      // key both carry the marker, and neither is projected by the port.
      expect(serialized).not.toContain(SECRET_MARKER);
      for (const forbidden of ['sessionSecret', 'secretHash', 'storageKey', 'expiresAt']) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('honest absence', () => {
    it('answers 200 with null for a customer-owned-product request', async () => {
      // No `submitted_session_id` and no Design Session, which is what a COP
      // request *correctly* looks like (`APP5-G01` §3). Nothing is fabricated:
      // no placement, no blank document, no catalog default.
      const requestId = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        customerOwnedProductName: 'Áo khoác của khách',
      });

      const response = await read(requestId).expect(200);

      expect(dataOf<SubmittedDesignPayload>(response).submittedDesign).toBeNull();
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('answers 200 with null when the pointed session has been purged', async () => {
      const { requestId, sessionId } = await seedSubmittedPair({ marker: 'purged', revision: 3 });
      // The TTL sweep hard-deletes the family; the pointer carries no FK, so it
      // survives the row it names (TBL-025 header).
      await context.rows(sql`delete from design_sessions where id = ${sessionId}`);

      const response = await read(requestId).expect(200);

      expect(dataOf<SubmittedDesignPayload>(response).submittedDesign).toBeNull();
    });

    it('answers 200 with null when the pointed session is no longer submitted evidence', async () => {
      const { requestId, sessionId } = await seedSubmittedPair({ marker: 'reverted', revision: 3 });
      await context.rows(sql`update design_sessions set status = 'ACTIVE' where id = ${sessionId}`);

      const response = await read(requestId).expect(200);

      expect(dataOf<SubmittedDesignPayload>(response).submittedDesign).toBeNull();
    });

    it('answers 200 with null when the pointer names another request’s session', async () => {
      const mine = await seedSubmittedPair({ marker: 'mine', revision: 2 });
      const theirs = await seedSubmittedPair({ marker: 'foreign', revision: 5 });
      // The request now points at a session that is `SUBMITTED` and perfectly
      // readable — and belongs to someone else. The correlation back to the
      // request is what refuses it, so substitution is impossible rather than
      // merely unattempted (§13).
      await context.rows(
        sql`update custom_requests set submitted_session_id = ${theirs.sessionId}
            where id = ${mine.requestId}`,
      );

      const response = await read(mine.requestId).expect(200);
      const payload = dataOf<SubmittedDesignPayload>(response);

      expect(payload.submittedDesign).toBeNull();
      expect(JSON.stringify(payload)).not.toContain('foreign');
    });
  });

  describe('the outer request', () => {
    it('answers 404 REQUEST_NOT_FOUND for an unknown request id', async () => {
      const response = await read('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099');

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('REQUEST_NOT_FOUND');
    });

    it('answers 400 for a malformed request id', async () => {
      const response = await read('not-a-uuid');

      expect(response.status).toBe(400);
    });

    it('never reports a Design Session error code to the caller', async () => {
      const { requestId, sessionId } = await seedSubmittedPair({ marker: 'quiet', revision: 1 });
      await context.rows(sql`delete from design_sessions where id = ${sessionId}`);

      const response = await read(requestId).expect(200);

      expect(JSON.stringify(response.body)).not.toContain('DESIGN_SESSION');
    });
  });

  describe('side effects', () => {
    it('mutates neither the request nor the session', async () => {
      const { requestId, sessionId } = await seedSubmittedPair({
        marker: 'immutable',
        revision: 4,
      });
      const snapshot = async () =>
        JSON.stringify({
          request: await context.rows(
            sql`select id, status, submitted_session_id, updated_at
                from custom_requests where id = ${requestId}`,
          ),
          session: await context.rows(
            sql`select id, status, autosave_revision, design_document, document_schema_version,
                       submitted_request_id, last_activity_at, updated_at
                from design_sessions where id = ${sessionId}`,
          ),
        });

      const before = await snapshot();
      await read(requestId).expect(200);
      await read(requestId).expect(200);

      expect(await snapshot()).toBe(before);
    });

    it('creates no transition, note, design version, snapshot or outbox row', async () => {
      const { requestId } = await seedSubmittedPair({ marker: 'no-writes', revision: 1 });
      // Compared before and after rather than asserted as zero once: a table
      // that was already empty proves nothing about what the read did.
      const of = async (table: string): Promise<number> =>
        context.count(sql`select count(*)::text as count from ${sql.raw(table)}`);
      const downstream = async () => ({
        transitions: await of('custom_request_transitions'),
        notes: await of('request_moderation_notes'),
        designCases: await of('design_cases'),
        designVersions: await of('design_versions'),
        approvalSnapshots: await of('approval_snapshots'),
        outbox: await of('outbox_events'),
        auditEvents: await of('audit_events'),
      });

      const before = await downstream();
      await read(requestId).expect(200);

      expect(await downstream()).toEqual(before);
    });
  });
});

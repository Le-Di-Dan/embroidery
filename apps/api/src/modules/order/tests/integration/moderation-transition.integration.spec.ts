/**
 * `APP5-B05` §13 — the guarded moderation transition, end to end.
 *
 * `APP6-B06`'s `TR-LC11-07` runs through the same route and the same use case
 * and is proved in `digitizing-transition.integration.spec.ts`, beside this file
 * rather than inside it: both suites would not fit one file under the 600-line
 * test limit, and the two cover different targets of one endpoint.
 *
 * Every transition APP5 exposes is driven through the real route with the real
 * Admin guard, and every refusal is checked for what it left behind rather than
 * only for its status code: a rejected command must leave the root, the history,
 * the notes and the outbox exactly as it found them.
 *
 * §11 and §12's interoperability proofs live here too, and deliberately in the
 * same file as the writes they read after: they assert what `APP5-B04` and
 * `APP5-B03` show **after** a real B05 mutation, so neither is a re-run of those
 * checkpoints' own suites.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  codeOf,
  createModerationContext,
  dataOf,
  grantScopedReader,
  ROUTES,
  type ModerationTestContext,
} from './moderation-context';

interface TransitionReceipt {
  readonly requestId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly moderationNoteSequence?: number;
  readonly occurredAt: string;
}

interface DetailView {
  readonly status: string;
  readonly internalReason?: string;
  readonly customerVisibleReason?: string;
  readonly transitions: readonly {
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actorKind: string;
    readonly actorAdminId?: string;
    readonly internalReason?: string;
    readonly customerVisibleReason?: string;
  }[];
  readonly moderationNotes: readonly { readonly kind: string; readonly note: string }[];
}

/** The two texts are always distinct values, so a merge is visible immediately. */
const INTERNAL = 'Nội bộ: ảnh khách gửi bị mờ, nghi ngờ trùng đơn cũ.';
const CUSTOMER = 'Bạn gửi giúp mình ảnh rõ hơn của áo nhé.';

describe('APP5-B05 guarded moderation transition (integration)', () => {
  let context: ModerationTestContext;

  beforeAll(async () => {
    context = await createModerationContext('app5-b05-transition');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  function move(requestId: string, body: object) {
    return request(context.server())
      .post(ROUTES.transitions(requestId))
      .set('Cookie', context.adminCookie())
      .send(body);
  }

  async function statusOf(requestId: string): Promise<string | undefined> {
    const [row] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${requestId}`,
    );
    return row?.status;
  }

  async function counts(requestId: string): Promise<Record<string, number>> {
    return {
      transitions: await context.count(
        sql`select count(*)::text as count from custom_request_transitions
            where custom_request_id = ${requestId}`,
      ),
      notes: await context.count(
        sql`select count(*)::text as count from request_moderation_notes
            where custom_request_id = ${requestId}`,
      ),
      outbox: await context.count(
        sql`select count(*)::text as count from outbox_events
            where aggregate_kind = 'CUSTOM_REQUEST' and aggregate_id = ${requestId}`,
      ),
    };
  }

  describe('the APP5 transition subset', () => {
    it('moves NEW -> UNDER_REVIEW with no reason and raises no customer event', async () => {
      const seeded = await context.seedRequest({ status: 'NEW' });
      const response = await move(seeded.requestId, { toStatus: 'UNDER_REVIEW' });

      expect(response.status).toBe(200);
      const receipt = dataOf<TransitionReceipt>(response);
      expect(receipt.fromStatus).toBe('NEW');
      expect(receipt.toStatus).toBe('UNDER_REVIEW');
      expect(receipt.moderationNoteSequence).toBeUndefined();
      expect(await statusOf(seeded.requestId)).toBe('UNDER_REVIEW');

      // TR-LC11-02 notifies nobody (`APP5-G01` §8), so no outbox row exists.
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 0, outbox: 0 });
    });

    it('moves UNDER_REVIEW -> NEEDS_CLARIFICATION with both reasons and a CLARIFY note', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      const response = await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'Đã nhắn khách qua Zalo.',
        moderationNoteKind: 'CLARIFY',
      });

      expect(response.status).toBe(200);
      expect(dataOf<TransitionReceipt>(response).moderationNoteSequence).toEqual(
        expect.any(Number),
      );
      expect(await statusOf(seeded.requestId)).toBe('NEEDS_CLARIFICATION');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 1, outbox: 1 });

      const [event] = await context.rows<{ event_type: string; payload: Record<string, unknown> }>(
        sql`select event_type, payload from outbox_events where aggregate_id = ${seeded.requestId}`,
      );
      expect(event?.event_type).toBe('request.clarification-requested');
      // SE-004 carries the customer's text and never the internal one.
      expect(event?.payload['customerVisibleReason']).toBe(CUSTOMER);
      expect(JSON.stringify(event?.payload)).not.toContain(INTERNAL);
    });

    it('moves NEEDS_CLARIFICATION -> UNDER_REVIEW with nothing', async () => {
      const seeded = await context.seedRequest({ status: 'NEEDS_CLARIFICATION' });
      const response = await move(seeded.requestId, { toStatus: 'UNDER_REVIEW' });

      expect(response.status).toBe(200);
      expect(await statusOf(seeded.requestId)).toBe('UNDER_REVIEW');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 0, outbox: 0 });
    });

    it('moves UNDER_REVIEW -> REJECTED with a REJECT note and a SE-012 event', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      const response = await move(seeded.requestId, {
        toStatus: 'REJECTED',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'Không đủ thông tin để báo giá.',
        moderationNoteKind: 'REJECT',
      });

      expect(response.status).toBe(200);
      expect(await statusOf(seeded.requestId)).toBe('REJECTED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 1, outbox: 1 });
      const [event] = await context.rows<{ event_type: string }>(
        sql`select event_type from outbox_events where aggregate_id = ${seeded.requestId}`,
      );
      expect(event?.event_type).toBe('request.rejected');
    });

    it('moves NEEDS_CLARIFICATION -> REJECTED with a SPAM note', async () => {
      const seeded = await context.seedRequest({ status: 'NEEDS_CLARIFICATION' });
      const response = await move(seeded.requestId, {
        toStatus: 'REJECTED',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'Gửi hàng loạt, nghi spam.',
        moderationNoteKind: 'SPAM',
      });

      expect(response.status).toBe(200);
      const [note] = await context.rows<{ kind: string }>(
        sql`select kind from request_moderation_notes where custom_request_id = ${seeded.requestId}`,
      );
      expect(note?.kind).toBe('SPAM');
    });

    it.each(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'])(
      'cancels from %s and persists both reasons on the request root',
      async (status) => {
        const seeded = await context.seedRequest({ status });
        const response = await move(seeded.requestId, {
          toStatus: 'CANCELLED',
          internalReason: INTERNAL,
          customerVisibleReason: CUSTOMER,
        });

        expect(response.status).toBe(200);
        const [row] = await context.rows<{
          status: string;
          cancelled_reason: string;
          cancelled_customer_reason: string;
        }>(
          sql`select status, cancelled_reason, cancelled_customer_reason
              from custom_requests where id = ${seeded.requestId}`,
        );
        expect(row?.status).toBe('CANCELLED');
        // COL-TBL037-08 and -09, distinct columns holding distinct values.
        expect(row?.cancelled_reason).toBe(INTERNAL);
        expect(row?.cancelled_customer_reason).toBe(CUSTOMER);
        expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 0, outbox: 1 });
      },
    );
  });

  describe('refusals leave nothing behind', () => {
    it('refuses a missing internal reason', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      const response = await move(seeded.requestId, {
        toStatus: 'REJECTED',
        customerVisibleReason: CUSTOMER,
        moderationNote: 'x',
        moderationNoteKind: 'REJECT',
      });

      expect(response.status).toBe(400);
      expect(codeOf(response)).toBe('TRANSITION_REASON_REQUIRED');
      expect(await statusOf(seeded.requestId)).toBe('UNDER_REVIEW');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it('refuses a missing customer-visible reason', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      const response = await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        moderationNote: 'x',
        moderationNoteKind: 'CLARIFY',
      });

      expect(response.status).toBe(400);
      expect(codeOf(response)).toBe('TRANSITION_CUSTOMER_REASON_REQUIRED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it('refuses a missing note, and a note whose kind does not describe the move', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      const missing = await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
      });
      expect(missing.status).toBe(400);
      expect(codeOf(missing)).toBe('MODERATION_NOTE_REQUIRED');

      const wrongKind = await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'x',
        moderationNoteKind: 'SPAM',
      });
      expect(wrongKind.status).toBe(400);
      expect(codeOf(wrongKind)).toBe('MODERATION_NOTE_KIND_INVALID');

      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    // `DIGITIZING` is deliberately absent: `APP6-B06` released it as a command
    // target, and its refusals are GRD-005's, proved in the B06 suite. These
    // four stay projections no operator may ask for (`APP6-G01` §4.1).
    it.each(['QUOTED', 'QUOTE_ACCEPTED', 'DESIGN_REVIEW', 'APPROVED'])(
      'refuses the system-owned APP6 target %s at the contract boundary',
      async (toStatus) => {
        const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
        const response = await move(seeded.requestId, {
          toStatus,
          internalReason: INTERNAL,
          customerVisibleReason: CUSTOMER,
        });

        expect(response.status).toBe(400);
        expect(await statusOf(seeded.requestId)).toBe('UNDER_REVIEW');
        expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
      },
    );

    it('refuses a move that is not available from the state the request is in', async () => {
      // A cancelled request is terminal; APP5 offers nothing from it.
      const seeded = await context.seedRequest({ status: 'CANCELLED' });
      const response = await move(seeded.requestId, {
        toStatus: 'REJECTED',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'x',
        moderationNoteKind: 'REJECT',
      });

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('INVALID_TRANSITION');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
      // No APP6 capability is named in the refusal copy.
      expect(JSON.stringify(response.body)).not.toMatch(/QUOT|DIGITIZ|DESIGN_REVIEW|APPROVED/);
    });

    it('refuses a customer-visible reason on a move that tells the customer nothing', async () => {
      const seeded = await context.seedRequest({ status: 'NEW' });
      const response = await move(seeded.requestId, {
        toStatus: 'UNDER_REVIEW',
        customerVisibleReason: CUSTOMER,
      });

      expect(response.status).toBe(400);
      expect(codeOf(response)).toBe('TRANSITION_CUSTOMER_REASON_NOT_ALLOWED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it('refuses an unauthenticated caller, and every server-owned field', async () => {
      const seeded = await context.seedRequest({ status: 'NEW' });

      const anonymous = await request(context.server())
        .post(ROUTES.transitions(seeded.requestId))
        .send({ toStatus: 'UNDER_REVIEW' });
      expect(anonymous.status).toBe(401);

      for (const extra of [
        { fromStatus: 'NEW' },
        { adminId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' },
        { customerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6098' },
        { actorKind: 'SYSTEM' },
        { correlationId: 'forged' },
        { sequence: 1 },
        { occurredAt: '2026-08-16T00:00:00.000Z' },
      ]) {
        const response = await move(seeded.requestId, { toStatus: 'UNDER_REVIEW', ...extra });
        expect(response.status).toBe(400);
      }

      expect(await statusOf(seeded.requestId)).toBe('NEW');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });
  });

  describe('audit evidence', () => {
    it('records the actor, both reasons and this request’s correlation id', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'Đã nhắn khách.',
        moderationNoteKind: 'CLARIFY',
      });

      const [row] = await context.rows<{
        from_status: string;
        to_status: string;
        actor_kind: string;
        admin_id: string;
        customer_id: string | null;
        system_job_key: string | null;
        reason: string;
        customer_visible_reason: string;
        correlation_id: string;
      }>(
        sql`select from_status, to_status, actor_kind, admin_id, customer_id, system_job_key,
                   reason, customer_visible_reason, correlation_id
            from custom_request_transitions where custom_request_id = ${seeded.requestId}`,
      );

      expect(row?.from_status).toBe('UNDER_REVIEW');
      expect(row?.to_status).toBe('NEEDS_CLARIFICATION');
      expect(row?.actor_kind).toBe('ADMIN');
      expect(row?.admin_id).toBe(context.adminId());
      // Exactly one actor reference is populated, matching the kind.
      expect(row?.customer_id).toBeNull();
      expect(row?.system_job_key).toBeNull();
      expect(row?.reason).toBe(INTERNAL);
      expect(row?.customer_visible_reason).toBe(CUSTOMER);
      // A real request id, not a fabricated constant.
      expect(row?.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  describe('B04 interoperability (§11)', () => {
    it('shows the new status, the history and the required note in the Admin detail', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
      await move(seeded.requestId, {
        toStatus: 'NEEDS_CLARIFICATION',
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
        moderationNote: 'Đã nhắn khách qua Zalo.',
        moderationNoteKind: 'CLARIFY',
      });

      const detail = dataOf<DetailView>(
        await request(context.server())
          .get(ROUTES.detail(seeded.requestId))
          .set('Cookie', context.adminCookie())
          .expect(200),
      );

      expect(detail.status).toBe('NEEDS_CLARIFICATION');
      expect(detail.transitions).toHaveLength(1);
      expect(detail.transitions[0]).toMatchObject({
        fromStatus: 'UNDER_REVIEW',
        toStatus: 'NEEDS_CLARIFICATION',
        actorKind: 'ADMIN',
        actorAdminId: context.adminId(),
        internalReason: INTERNAL,
        customerVisibleReason: CUSTOMER,
      });
      expect(detail.moderationNotes).toEqual([
        expect.objectContaining({ kind: 'CLARIFY', note: 'Đã nhắn khách qua Zalo.' }),
      ]);
      // The distinction B04 exists to preserve, after a real B05 write.
      expect(detail.internalReason).toBe(INTERNAL);
      expect(detail.customerVisibleReason).toBe(CUSTOMER);
      expect(detail.internalReason).not.toBe(detail.customerVisibleReason);
    });
  });

  describe('B03 interoperability (§12)', () => {
    it.each([
      ['NEEDS_CLARIFICATION', 'UNDER_REVIEW', 'CLARIFY'],
      ['REJECTED', 'UNDER_REVIEW', 'REJECT'],
      ['CANCELLED', 'NEW', undefined],
    ] as const)(
      'shows the customer only the customer-visible reason after a move to %s',
      async (toStatus, from, noteKind) => {
        await context.publishSecureLinkPolicy();
        const seeded = await context.seedRequest({ status: from });

        await move(seeded.requestId, {
          toStatus,
          internalReason: INTERNAL,
          customerVisibleReason: CUSTOMER,
          ...(noteKind === undefined
            ? {}
            : { moderationNote: 'Ghi chú nội bộ.', moderationNoteKind: noteKind }),
        }).expect(200);

        const outcome = await context.asRequest(() =>
          grantScopedReader(context).read(
            { ip: '203.0.113.10', headers: {}, socket: { remoteAddress: '203.0.113.10' } } as never,
            { token: seeded.grantToken },
          ),
        );

        expect(outcome.outcome).toBe('READ');
        const serialized = JSON.stringify(outcome);
        expect(serialized).toContain(CUSTOMER);
        // The internal reason and the note text are absent — not redacted, not
        // masked, simply not on the customer projection at all.
        expect(serialized).not.toContain(INTERNAL);
        expect(serialized).not.toContain('Ghi chú nội bộ.');
      },
    );
  });
});

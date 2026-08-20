/**
 * `APP6-B06` §12 — `TR-LC11-07`, the one APP6 transition an operator commands.
 *
 * Same route, same guard, same use case and same transaction as every APP5
 * moderation move: `POST /api/admin/custom-requests/{requestId}/transitions`,
 * `adminCustomRequest_transition`, unchanged and not reissued. B06 published no
 * operation of its own, so there is no new surface to drive — only one more
 * value of `toStatus`, and the guard standing behind it.
 *
 * What this suite is for is the seam an unguarded widening would open: an
 * operator forcing `DIGITIZING` on a request nobody has committed to. GRD-005
 * (ADR-DB3-001 r1) has no override, so every source state is driven through the
 * real route and every refusal is checked for what it left behind rather than
 * only for its status code.
 *
 * It deliberately does **not** re-run `APP6-B05`: the `QUOTE_ACCEPTED` fixture
 * is seeded directly, because what B06 owns is what happens *from* that state,
 * not how a request reaches it.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestRepository,
} from '../../domain/repositories/custom-request.repository';
import {
  codeOf,
  createModerationContext,
  dataOf,
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

const CUSTOMER_TEXT = 'Chúng tôi đang số hoá mẫu thêu của bạn.';

describe('APP6-B06 digitizing transition (integration)', () => {
  let context: ModerationTestContext;

  beforeAll(async () => {
    context = await createModerationContext('app6-b06-digitizing');
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

  /** The root's own evidence: its transition row, its notes, its outbox. */
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

  /**
   * Everything a quotation, design, commercial or production side effect lands
   * in. Compared before and after the move rather than asserted as zero once: a
   * table that was already empty proves nothing about what the transition did.
   */
  async function downstream(): Promise<Record<string, number>> {
    const of = async (table: string): Promise<number> =>
      context.count(sql`select count(*)::text as count from ${sql.raw(table)}`);
    return {
      quotations: await of('quotations'),
      quotationVersions: await of('quotation_versions'),
      quotationAcceptances: await of('quotation_acceptances'),
      designVersions: await of('design_versions'),
      approvalSnapshots: await of('approval_snapshots'),
      orders: await of('orders'),
      paymentObligations: await of('payment_obligations'),
    };
  }

  describe('the move itself', () => {
    it('moves QUOTE_ACCEPTED -> DIGITIZING with nothing at all', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });

      const response = await move(seeded.requestId, { toStatus: 'DIGITIZING' });

      expect(response.status).toBe(200);
      const receipt = dataOf<TransitionReceipt>(response);
      expect(receipt.requestId).toBe(seeded.requestId);
      // Read and locked by the server. The body carried no `fromStatus`.
      expect(receipt.fromStatus).toBe('QUOTE_ACCEPTED');
      expect(receipt.toStatus).toBe('DIGITIZING');
      expect(receipt.moderationNoteSequence).toBeUndefined();
      expect(await statusOf(seeded.requestId)).toBe('DIGITIZING');

      // The root moved and its TBL-042 row exists — and nothing else. DB3 LC-11
      // raises no event for TR-LC11-07 and `APP6-G01` §4 records its outbox
      // column as `none`, so a row here would be invented event vocabulary.
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 0, outbox: 0 });
    });

    it('creates no quotation, design, order, payment or production effect', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      const before = await downstream();

      await move(seeded.requestId, { toStatus: 'DIGITIZING' }).expect(200);

      expect(await downstream()).toEqual(before);
    });

    it('records an ADMIN actor, a real correlation id and neither reason text', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      await move(seeded.requestId, { toStatus: 'DIGITIZING' }).expect(200);

      const [row] = await context.rows<{
        from_status: string;
        to_status: string;
        actor_kind: string;
        admin_id: string;
        customer_id: string | null;
        system_job_key: string | null;
        reason: string | null;
        customer_visible_reason: string | null;
        correlation_id: string;
      }>(
        sql`select from_status, to_status, actor_kind, admin_id, customer_id, system_job_key,
                   reason, customer_visible_reason, correlation_id
            from custom_request_transitions where custom_request_id = ${seeded.requestId}`,
      );

      expect(row?.from_status).toBe('QUOTE_ACCEPTED');
      expect(row?.to_status).toBe('DIGITIZING');
      // An **admin** command, and it stays one. Recording it as SYSTEM would
      // erase which operator committed the shop to digitizing labour.
      expect(row?.actor_kind).toBe('ADMIN');
      expect(row?.admin_id).toBe(context.adminId());
      expect(row?.customer_id).toBeNull();
      expect(row?.system_job_key).toBeNull();
      expect(row?.reason).toBeNull();
      expect(row?.customer_visible_reason).toBeNull();
      // This request's own id, put there by the middleware, not a constant.
      expect(row?.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  describe('GRD-005', () => {
    it.each(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'QUOTED'])(
      'refuses a request still in %s with QUOTE_NOT_ACCEPTED',
      async (status) => {
        const seeded = await context.seedRequest({ status });
        const response = await move(seeded.requestId, { toStatus: 'DIGITIZING' });

        expect(response.status).toBe(409);
        expect(codeOf(response)).toBe('QUOTE_NOT_ACCEPTED');
        // ADR-DB3-001 r1 — no admin override, so the refusal is total.
        expect(await statusOf(seeded.requestId)).toBe(status);
        expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
      },
    );

    it('refuses the same request however fully the operator justifies it', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTED' });
      const response = await move(seeded.requestId, {
        toStatus: 'DIGITIZING',
        internalReason: 'Khách đã đồng ý qua điện thoại, bắt đầu trước.',
        moderationNote: 'Đã xác nhận miệng.',
        moderationNoteKind: 'NOTE',
      });

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('QUOTE_NOT_ACCEPTED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it.each(['DESIGN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])(
      'refuses %s with the canonical INVALID_TRANSITION, not a GRD-005 synonym',
      async (status) => {
        // None of these can still reach `QUOTE_ACCEPTED`, so "get the quotation
        // accepted first" would be advice the operator cannot act on.
        const seeded = await context.seedRequest({ status });
        const response = await move(seeded.requestId, { toStatus: 'DIGITIZING' });

        expect(response.status).toBe(409);
        expect(codeOf(response)).toBe('INVALID_TRANSITION');
        expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
      },
    );

    it('refuses a repeat, leaving exactly one transition row', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      await move(seeded.requestId, { toStatus: 'DIGITIZING' }).expect(200);

      const repeat = await move(seeded.requestId, { toStatus: 'DIGITIZING' });
      expect(repeat.status).toBe(409);
      expect(codeOf(repeat)).toBe('INVALID_TRANSITION');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 0, outbox: 0 });
    });
  });

  describe('the command surface stays narrow', () => {
    it.each(['QUOTED', 'QUOTE_ACCEPTED', 'DESIGN_REVIEW', 'APPROVED'])(
      'still refuses the system-owned target %s at the schema boundary',
      async (toStatus) => {
        // `APP6-G01` §4.1. B06 widened the enum by one value; these four are
        // reached only inside the quotation or design transaction that causes
        // them, and a client's attempt dies before the policy is consulted.
        const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
        const response = await move(seeded.requestId, { toStatus });

        expect(response.status).toBe(400);
        expect(await statusOf(seeded.requestId)).toBe('QUOTE_ACCEPTED');
        expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
      },
    );

    it('offers no move out of QUOTE_ACCEPTED other than DIGITIZING', async () => {
      // One request, four commands. Every one is refused, so the row never
      // leaves QUOTE_ACCEPTED and each command is judged against the same state
      // the previous one was.
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      for (const toStatus of ['UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'REJECTED', 'CANCELLED']) {
        const response = await move(seeded.requestId, {
          toStatus,
          internalReason: 'x',
          ...(toStatus === 'UNDER_REVIEW' ? {} : { customerVisibleReason: 'y' }),
          ...(toStatus === 'REJECTED' ? { moderationNote: 'z', moderationNoteKind: 'REJECT' } : {}),
        });

        expect(response.status).toBe(409);
        expect(codeOf(response)).toBe('INVALID_TRANSITION');
      }

      expect(await statusOf(seeded.requestId)).toBe('QUOTE_ACCEPTED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it('accepts no server-owned field on the new target either', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      for (const extra of [
        { fromStatus: 'QUOTED' },
        { adminId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' },
        { actorKind: 'SYSTEM' },
        { correlationId: 'forged' },
        { occurredAt: '2026-08-20T00:00:00.000Z' },
      ]) {
        const response = await move(seeded.requestId, { toStatus: 'DIGITIZING', ...extra });
        expect(response.status).toBe(400);
      }

      expect(await statusOf(seeded.requestId)).toBe('QUOTE_ACCEPTED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });
  });

  describe('reason and note semantics', () => {
    it('refuses a customer-visible reason rather than dropping it', async () => {
      // TR-LC11-07 notifies nobody, so a customer-visible text here would be a
      // message with no delivery that `APP5-B03` would then show as the
      // explanation of a state the customer was never told about.
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      const response = await move(seeded.requestId, {
        toStatus: 'DIGITIZING',
        customerVisibleReason: CUSTOMER_TEXT,
      });

      expect(response.status).toBe(400);
      expect(codeOf(response)).toBe('TRANSITION_CUSTOMER_REASON_NOT_ALLOWED');
      expect(await statusOf(seeded.requestId)).toBe('QUOTE_ACCEPTED');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });
    });

    it('inherits no moderation note kind, and files an optional NOTE', async () => {
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      const wrongKind = await move(seeded.requestId, {
        toStatus: 'DIGITIZING',
        moderationNote: 'x',
        moderationNoteKind: 'REJECT',
      });
      expect(wrongKind.status).toBe(400);
      expect(codeOf(wrongKind)).toBe('MODERATION_NOTE_KIND_INVALID');
      expect(await counts(seeded.requestId)).toEqual({ transitions: 0, notes: 0, outbox: 0 });

      const accepted = await move(seeded.requestId, {
        toStatus: 'DIGITIZING',
        internalReason: 'Giao cho bạn Hà số hoá.',
        moderationNote: 'Bắt đầu lúc 09:15.',
        moderationNoteKind: 'NOTE',
      });
      expect(accepted.status).toBe(200);
      expect(dataOf<TransitionReceipt>(accepted).moderationNoteSequence).toEqual(
        expect.any(Number),
      );
      expect(await statusOf(seeded.requestId)).toBe('DIGITIZING');
      // Still no outbox row: an accompanying note does not make this a message.
      expect(await counts(seeded.requestId)).toEqual({ transitions: 1, notes: 1, outbox: 0 });
    });

    it('keeps the internal reason on the transition row and off the root', async () => {
      const internal = 'Ưu tiên đơn này, khách hẹn lấy sớm.';
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      await move(seeded.requestId, { toStatus: 'DIGITIZING', internalReason: internal }).expect(
        200,
      );

      const [root] = await context.rows<{
        cancelled_reason: string | null;
        cancelled_customer_reason: string | null;
      }>(
        sql`select cancelled_reason, cancelled_customer_reason
            from custom_requests where id = ${seeded.requestId}`,
      );
      // COL-TBL037-08/09 belong to a cancellation and to nothing else.
      expect(root?.cancelled_reason).toBeNull();
      expect(root?.cancelled_customer_reason).toBeNull();

      const [transition] = await context.rows<{ reason: string }>(
        sql`select reason from custom_request_transitions
            where custom_request_id = ${seeded.requestId}`,
      );
      expect(transition?.reason).toBe(internal);
    });
  });

  describe('stale protection', () => {
    it('pins the source state it judged, so a stale decision cannot reapply', async () => {
      // `APP6-B06` changes no lock, no transaction boundary and no `expectedFrom`
      // handling, so `APP5-B05`'s race suite is not re-run. What is proved here
      // is that the *new target* travels the same guarded path: the state the
      // policy was judged against is handed to the repository as `expectedFrom`,
      // which is what refuses a decision whose source state has moved on.
      const seeded = await context.seedRequest({ status: 'QUOTE_ACCEPTED' });
      const repository = context.get<CustomRequestRepository>(CUSTOM_REQUEST_REPOSITORY);
      const spy = jest.spyOn(repository, 'transition');

      try {
        await move(seeded.requestId, { toStatus: 'DIGITIZING' }).expect(200);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0]?.[0]).toMatchObject({
          id: seeded.requestId,
          to: 'DIGITIZING',
          expectedFrom: 'QUOTE_ACCEPTED',
          actor: { kind: 'ADMIN', adminId: context.adminId() },
        });
      } finally {
        spy.mockRestore();
      }
    });
  });
});

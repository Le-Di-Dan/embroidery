/**
 * `TR-LC12-02` against a real PostgreSQL instance (`APP6-B03`).
 *
 * The properties below are only observable against real rows: that one command
 * freezes a version, advances **both** current pointers, supersedes the prior
 * live price and moves the request, all in one commit; that the validity window
 * comes from published policy rather than from a constant; that nothing is
 * re-priced; and that sending the same version twice is a replay rather than a
 * second event.
 *
 * The use case is exercised directly rather than over HTTP: the guard
 * composition and the published shape are presentation facts the contract suite
 * proves against the committed document, while what needs a database here is the
 * transaction boundary and the pointer coherence across two contexts.
 *
 * Atomicity and the request-state race live in
 * `quotation-send-atomicity.integration.spec.ts` — the same harness, kept apart
 * so neither file has to be skimmed to find the other's proof.
 */
import { sql } from 'drizzle-orm';

import { createSendTestContext, failureOf, type SendTestContext } from './quotation-send-context';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import type {
  QuotationId,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

const DAY_MS = 24 * 60 * 60 * 1_000;

/** The dataset's published value, restated so a drift shows up as a failure. */
const PUBLISHED_VALIDITY_DAYS = 7;

describe('APP6-B03 quotation send (integration)', () => {
  let harness: SendTestContext;

  beforeAll(async () => {
    harness = await createSendTestContext('app6-b03-send');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.publishValidity({ validityDays: PUBLISHED_VALIDITY_DAYS });
  });

  /** A request, its quotation and one DRAFT version, ready to send. */
  async function seedSendable(requestStatus = 'UNDER_REVIEW'): Promise<{
    requestId: CustomRequestId;
    quotationId: QuotationId;
    versionId: QuotationVersionId;
  }> {
    const requestId = await harness.seedRequest(requestStatus);
    const quotationId = await harness.seedQuotation(requestId);
    const versionId = await harness.addDraft(quotationId, 150_000);
    return { requestId, quotationId, versionId };
  }

  function send(quotationId: QuotationId, versionId: QuotationVersionId) {
    return harness.asAdmin(() => harness.sender().send({ quotationId, versionId }));
  }

  async function versionRow(id: QuotationVersionId) {
    const [row] = await harness.rows<{
      status: string;
      sent_at: unknown;
      valid_from: unknown;
      valid_until: unknown;
      superseded_at: unknown;
      total_amount: string;
      deposit_amount: string;
      remaining_amount: string;
      subtotal_amount: string;
      deposit_percent: string;
    }>(sql`select * from quotation_versions where id = ${id}`);
    return row!;
  }

  /**
   * A `timestamptz` read back through raw SQL, as milliseconds.
   *
   * The driver hands these back as strings on this path rather than as `Date`,
   * so the window arithmetic below parses instead of assuming — an assumption
   * would have made every duration assertion throw rather than compare.
   */
  function instantMs(value: unknown): number {
    return new Date(value as string).getTime();
  }

  describe('the committed send', () => {
    it('freezes the DRAFT and projects UNDER_REVIEW → QUOTED', async () => {
      const { requestId, quotationId, versionId } = await seedSendable();

      const view = await send(quotationId, versionId);

      expect(view.version.status).toBe('SENT');
      expect(view.requestStatus).toBe('QUOTED');
      expect(view.requestTransitioned).toBe(true);
      expect(view.replayed).toBe(false);

      const row = await versionRow(versionId);
      expect(row.status).toBe('SENT');
      expect(row.sent_at).not.toBeNull();
      expect(row.valid_from).toEqual(row.sent_at);

      const [request] = await harness.rows<{ status: string }>(
        sql`select status from custom_requests where id = ${requestId}`,
      );
      expect(request!.status).toBe('QUOTED');
    });

    it('makes the four pointer facts agree after commit', async () => {
      const { requestId, quotationId, versionId } = await seedSendable();

      await send(quotationId, versionId);

      // The whole of `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01`, read back from
      // the rows rather than from the response: same-request and
      // same-quotation ownership is a transaction-level fact (REL-068 is "TX
      // consistency"), so the physical FKs alone would not prove it.
      const [coherence] = await harness.rows<{
        request_points_at: string;
        quotation_points_at: string;
        version_belongs_to: string;
        quotation_belongs_to: string;
      }>(sql`
        select r.current_quotation_id as request_points_at,
               q.current_version_id   as quotation_points_at,
               v.quotation_id         as version_belongs_to,
               q.custom_request_id    as quotation_belongs_to
          from custom_requests r
          join quotations q on q.id = r.current_quotation_id
          join quotation_versions v on v.id = q.current_version_id
         where r.id = ${requestId}
      `);

      expect(coherence).toEqual({
        request_points_at: quotationId,
        quotation_points_at: versionId,
        version_belongs_to: quotationId,
        quotation_belongs_to: requestId,
      });
    });

    it('appends exactly one transition, one audit row and one outbox event', async () => {
      const { requestId, quotationId, versionId } = await seedSendable();

      await send(quotationId, versionId);

      const [transition] = await harness.rows<{
        from_status: string;
        to_status: string;
        actor_kind: string;
        system_job_key: string | null;
        admin_id: string | null;
      }>(sql`
        select from_status, to_status, actor_kind, system_job_key, admin_id
          from custom_request_transitions where custom_request_id = ${requestId}
      `);
      expect(transition).toEqual({
        from_status: 'UNDER_REVIEW',
        to_status: 'QUOTED',
        // The projection's actor is the system, not the operator who commanded
        // the send: the move is a consequence of this transaction committing.
        actor_kind: 'SYSTEM',
        system_job_key: 'quotation.send',
        admin_id: null,
      });

      const [audit] = await harness.rows<{
        action: string;
        target_kind: string;
        target_id: string;
        actor_kind: string;
      }>(sql`select action, target_kind, target_id, actor_kind from audit_events`);
      expect(audit).toEqual({
        action: 'quotation.sent',
        target_kind: 'QUOTATION_VERSION',
        target_id: versionId,
        // The audit's actor *is* the operator: an Admin commanded the send.
        actor_kind: 'ADMIN',
      });

      const [event] = await harness.rows<{
        event_type: string;
        aggregate_kind: string;
        aggregate_id: string;
        status: string;
        payload: Record<string, unknown>;
      }>(sql`select * from outbox_events`);
      expect(event!.event_type).toBe('quotation.sent');
      expect(event!.aggregate_kind).toBe('QUOTATION');
      expect(event!.aggregate_id).toBe(quotationId);
      expect(event!.status).toBe('PENDING');
    });

    it('carries exact money as strings in the event and no document content', async () => {
      const { quotationId, versionId } = await seedSendable();

      const view = await send(quotationId, versionId);
      const [event] = await harness.rows<{ payload: Record<string, unknown> }>(
        sql`select payload from outbox_events`,
      );
      const payload = event!.payload;

      expect(payload['totalAmount']).toBe('1550000.00');
      expect(payload['depositAmount']).toBe('620000.00');
      expect(payload['remainingAmount']).toBe('930000.00');
      expect(typeof payload['totalAmount']).toBe('string');
      expect(payload['totalAmount']).toBe(view.version.totalAmount);

      // SE-004's annotation is "amounts OK; no doc content", and nothing that
      // authorizes a customer may travel either.
      for (const forbidden of [
        'lineItems',
        'document',
        'designDocument',
        'customerId',
        'grantId',
        'token',
        'storageKey',
        'adminId',
      ]) {
        expect(Object.keys(payload)).not.toContain(forbidden);
      }
    });

    it('re-prices nothing: every amount and line survives the send unchanged', async () => {
      const { quotationId, versionId } = await seedSendable();
      const before = await versionRow(versionId);
      const linesBefore = await harness.rows(
        sql`select * from quotation_line_items where quotation_version_id = ${versionId}
             order by position`,
      );

      await send(quotationId, versionId);

      const after = await versionRow(versionId);
      expect({
        subtotal: after.subtotal_amount,
        total: after.total_amount,
        deposit: after.deposit_amount,
        remaining: after.remaining_amount,
        percent: after.deposit_percent,
      }).toEqual({
        subtotal: before.subtotal_amount,
        total: before.total_amount,
        deposit: before.deposit_amount,
        remaining: before.remaining_amount,
        percent: before.deposit_percent,
      });
      expect(
        await harness.rows(
          sql`select * from quotation_line_items where quotation_version_id = ${versionId}
               order by position`,
        ),
      ).toEqual(linesBefore);
    });
  });

  describe('the validity window comes from published policy', () => {
    it('uses the published number of calendar days, not a literal', async () => {
      // Republished at three days: a hard-coded `7` anywhere on the path would
      // survive this change and fail here.
      await harness.publishValidity({ validityDays: 3 });
      const { quotationId, versionId } = await seedSendable();

      await send(quotationId, versionId);

      const row = await versionRow(versionId);
      const window = instantMs(row.valid_until) - instantMs(row.valid_from);
      expect(window).toBe(3 * DAY_MS);
    });

    it('uses seven days when the dataset value is published', async () => {
      const { quotationId, versionId } = await seedSendable();

      await send(quotationId, versionId);

      const row = await versionRow(versionId);
      expect(instantMs(row.valid_until) - instantMs(row.valid_from)).toBe(
        PUBLISHED_VALIDITY_DAYS * DAY_MS,
      );
    });

    it('refuses before any write when the policy is unpublished', async () => {
      const { requestId, quotationId, versionId } = await seedSendable();
      await harness.clearValidity();

      expect(await failureOf(() => send(quotationId, versionId))).toBe(
        'QUOTATION_POLICY_UNAVAILABLE',
      );

      const row = await versionRow(versionId);
      expect(row.status).toBe('DRAFT');
      expect(row.sent_at).toBeNull();
      expect(await harness.count(sql`select count(*)::text as count from outbox_events`)).toBe(0);
      expect(
        await harness.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${requestId}`,
        ),
      ).toBe(0);
    });

    it('refuses an incoherent published window rather than guessing one', async () => {
      await harness.publishValidity({ validityDays: 0 });
      const { quotationId, versionId } = await seedSendable();

      expect(await failureOf(() => send(quotationId, versionId))).toBe(
        'QUOTATION_POLICY_UNAVAILABLE',
      );
    });
  });

  describe('superseding the prior live price', () => {
    it('supersedes the previously sent version and promotes the new one', async () => {
      const { quotationId, versionId: first } = await seedSendable();
      await send(quotationId, first);
      const second = await harness.addDraft(quotationId, 170_000);

      const view = await send(quotationId, second);

      expect((await versionRow(first)).status).toBe('SUPERSEDED');
      expect((await versionRow(first)).superseded_at).not.toBeNull();
      expect((await versionRow(second)).status).toBe('SENT');
      expect(view.quotation.currentVersionId).toBe(second);
    });

    it('supersedes a live version that is not the immediately preceding one', async () => {
      const { quotationId, versionId: first } = await seedSendable();
      await send(quotationId, first);
      // Two further drafts before the next send: version 2 is never sent, so
      // the live price is version 1 while the send is of version 3.
      await harness.addDraft(quotationId, 160_000);
      const third = await harness.addDraft(quotationId, 170_000);

      await send(quotationId, third);

      // The failure this rules out: one quotation carrying two `SENT` versions,
      // only one of which `current_version_id` can name.
      expect(
        await harness.count(
          sql`select count(*)::text as count from quotation_versions
               where quotation_id = ${quotationId} and status = 'SENT'`,
        ),
      ).toBe(1);
      expect((await versionRow(first)).status).toBe('SUPERSEDED');
    });

    it('leaves a superseded version’s own recorded facts intact', async () => {
      const { quotationId, versionId: first } = await seedSendable();
      await send(quotationId, first);
      const frozen = await versionRow(first);
      const second = await harness.addDraft(quotationId, 170_000);

      await send(quotationId, second);

      const after = await versionRow(first);
      expect(after.sent_at).toEqual(frozen.sent_at);
      expect(after.valid_until).toEqual(frozen.valid_until);
      expect(after.total_amount).toBe(frozen.total_amount);
      expect(after.deposit_amount).toBe(frozen.deposit_amount);
    });
  });

  describe('re-send is a replay, not a second send', () => {
    it('returns the committed result and writes nothing', async () => {
      const { requestId, quotationId, versionId } = await seedSendable();
      const first = await send(quotationId, versionId);
      const frozen = await versionRow(versionId);

      const replay = await send(quotationId, versionId);

      expect(replay.replayed).toBe(true);
      expect(replay.requestTransitioned).toBe(false);
      expect(replay.version.versionId).toBe(first.version.versionId);
      expect(replay.version.totalAmount).toBe(first.version.totalAmount);

      const after = await versionRow(versionId);
      // Not re-frozen: the send instant and the window a customer was told are
      // the ones the first commit set.
      expect(after.sent_at).toEqual(frozen.sent_at);
      expect(after.valid_until).toEqual(frozen.valid_until);

      expect(
        await harness.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${requestId}`,
        ),
      ).toBe(1);
      expect(await harness.count(sql`select count(*)::text as count from outbox_events`)).toBe(1);
      expect(await harness.count(sql`select count(*)::text as count from audit_events`)).toBe(1);
    });
  });

  describe('a request already QUOTED', () => {
    it('replaces the current version without a fake self-transition', async () => {
      const { requestId, quotationId, versionId: first } = await seedSendable();
      await send(quotationId, first);
      const second = await harness.addDraft(quotationId, 170_000);

      const view = await send(quotationId, second);

      expect(view.requestStatus).toBe('QUOTED');
      // The request did not move, so no transition row claims that it did. A
      // `QUOTED → QUOTED` edge does not exist in LC-11.
      expect(view.requestTransitioned).toBe(false);
      expect(
        await harness.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${requestId}`,
        ),
      ).toBe(1);
      // …but the customer-facing price did move, and it was announced.
      expect(view.quotation.currentVersionId).toBe(second);
      expect(await harness.count(sql`select count(*)::text as count from outbox_events`)).toBe(2);
    });
  });

  describe('what cannot be sent', () => {
    it.each([
      'NEW',
      'NEEDS_CLARIFICATION',
      'QUOTE_ACCEPTED',
      'DIGITIZING',
      'REJECTED',
      'CANCELLED',
    ])('refuses a request in %s without inventing a backward transition', async (status) => {
      const { requestId, quotationId, versionId } = await seedSendable(status);

      expect(await failureOf(() => send(quotationId, versionId))).toBe('REQUEST_NOT_SENDABLE');

      expect((await versionRow(versionId)).status).toBe('DRAFT');
      expect(
        await harness.count(
          sql`select count(*)::text as count from custom_request_transitions
                 where custom_request_id = ${requestId}`,
        ),
      ).toBe(0);
      expect(await harness.count(sql`select count(*)::text as count from outbox_events`)).toBe(0);
    });

    it('refuses a version that is no longer a draft', async () => {
      const { quotationId, versionId: first } = await seedSendable();
      await send(quotationId, first);
      const second = await harness.addDraft(quotationId, 170_000);
      await send(quotationId, second);

      // `first` is now SUPERSEDED: a settled price never goes back in play.
      expect(await failureOf(() => send(quotationId, first))).toBe(
        'QUOTATION_VERSION_NOT_SENDABLE',
      );
    });

    it('will not send another quotation’s version through this quotation’s address', async () => {
      const mine = await seedSendable();
      const theirs = await seedSendable();

      expect(await failureOf(() => send(mine.quotationId, theirs.versionId))).toBe(
        // The same answer a missing version gets: the wrong path must not
        // confirm that the version exists somewhere else.
        'QUOTATION_VERSION_NOT_FOUND',
      );
      expect((await versionRow(theirs.versionId)).status).toBe('DRAFT');
    });

    it('answers QUOTATION_NOT_FOUND for a quotation that does not exist', async () => {
      const { versionId } = await seedSendable();

      expect(
        await failureOf(() =>
          send('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' as QuotationId, versionId),
        ),
      ).toBe('QUOTATION_NOT_FOUND');
    });
  });
});

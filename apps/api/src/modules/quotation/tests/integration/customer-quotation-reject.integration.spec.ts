/**
 * `APP6-B05` — quotation rejection (`TR-LC12-06`) and the acceptance
 * transaction's atomic rollback, against a real database.
 *
 * Two subjects in one suite because they share the one expensive fixture and
 * because they prove complementary halves of the same rule: what a decision is
 * *allowed* to touch, and what happens to everything it touched when the
 * transaction does not commit.
 */
import { sql } from 'drizzle-orm';

import {
  createQuotationDecisionContext,
  type QuotationDecisionTestContext,
  type SeededDecisionTarget,
} from './quotation-decision-context';
import { QuotationDecisionRecorder } from '../../application/customer/quotation-decision.recorder';
import { isQuotationDecisionError } from '../../domain/decision/quotation-decision.errors';
import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import type { QuotationVersionId } from '../../domain/repositories/quotation.repository';

const FRESH = 60;

describe('APP6-B05 quotation rejection and rollback (integration)', () => {
  let context: QuotationDecisionTestContext;

  beforeAll(async () => {
    context = await createQuotationDecisionContext('app6-b05-reject');
    await context.publishPolicies();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  function reject(target: SeededDecisionTarget, versionId?: QuotationVersionId) {
    return context.asRequest(() =>
      context.rejection.reject({ token: target.token, versionId: versionId ?? target.versionId }),
    );
  }

  function accept(target: SeededDecisionTarget) {
    return context.asRequest(() =>
      context.acceptance.accept({ token: target.token, versionId: target.versionId }),
    );
  }

  async function failureOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      if (isQuotationDecisionError(error)) return error.failure;
      if (isSecureLinkError(error)) return error.code;
      throw error;
    }
    throw new Error('Expected the decision to be refused.');
  }

  async function rowsOf(target: SeededDecisionTarget) {
    const [version] = await context.rows<{ status: string }>(
      sql`select status from quotation_versions where id = ${target.versionId}`,
    );
    const [quotation] = await context.rows<{ status: string; current_version_id: string }>(
      sql`select status, current_version_id from quotations where id = ${target.quotationId}`,
    );
    const [request] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${target.requestId}`,
    );
    return { version: version!, quotation: quotation!, request: request! };
  }

  describe('the committed rejection', () => {
    it('moves the version and the header, and nothing else', async () => {
      const target = await context.seedTarget();

      const view = await reject(target);

      expect(view.versionId).toBe(target.versionId);
      expect(view.versionStatus).toBe('REJECTED');
      expect(view.quotationStatus).toBe('REJECTED');

      const state = await rowsOf(target);
      expect(state.version.status).toBe('REJECTED');
      expect(state.quotation.status).toBe('REJECTED');
      // The pointer still names the version the customer was shown: clearing it
      // would make the header describe a quotation that had never been sent.
      expect(state.quotation.current_version_id).toBe(target.versionId);
    });

    it('does NOT project the custom request to REJECTED', async () => {
      const target = await context.seedTarget();

      await reject(target);

      const state = await rowsOf(target);
      // The single most important assertion in this file. `REJECTED` on a
      // request is an Admin moderation outcome; declining a price is not one.
      expect(state.request.status).toBe('QUOTED');
      expect(state.request.status).not.toBe('REJECTED');
    });

    it('appends no custom-request transition at all', async () => {
      const target = await context.seedTarget();

      await reject(target);

      expect(
        await context.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${target.requestId}`,
        ),
      ).toBe(0);
    });

    it('requires no step-up: the customer has never verified anything', async () => {
      // Seeded with no `stepUpVerifiedSecondsAgo`, so no STEP_UP row exists for
      // this contact at all. Acceptance would answer REVERIFICATION_REQUIRED
      // from exactly this state; rejection commits.
      const target = await context.seedTarget();
      expect(
        await context.count(
          sql`select count(*)::text as count from contact_verification_challenges
               where normalized_value = ${target.normalizedValue}`,
        ),
      ).toBe(0);

      await expect(reject(target)).resolves.toMatchObject({ versionStatus: 'REJECTED' });
    });

    it('audits the rejection as the customer’s, with no amount in the summary', async () => {
      const target = await context.seedTarget();

      await reject(target);

      const [audit] = await context.rows<{
        actor_kind: string;
        customer_id: string;
        grant_id: string;
        summary: Record<string, unknown>;
      }>(sql`select actor_kind, customer_id, grant_id, summary from audit_events
               where action = 'quotation.rejected' and target_id = ${target.versionId}`);
      expect(audit!.actor_kind).toBe('CUSTOMER');
      expect(audit!.customer_id).toBe(target.customerId);
      expect(audit!.grant_id).toBe(target.grantId);
      // A rejection agrees to nothing, so there is no accepted total to record.
      expect(Object.keys(audit!.summary).sort()).toEqual(['quotationId', 'version']);
    });

    it('writes no acceptance evidence and no idempotency record', async () => {
      const target = await context.seedTarget();

      await reject(target);

      expect(
        await context.count(
          sql`select count(*)::text as count from quotation_acceptances
               where quotation_version_id = ${target.versionId}`,
        ),
      ).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from idempotency_records
               where operation_namespace = 'quotation.accept' and scope_key = ${target.versionId}`,
        ),
      ).toBe(0);
    });

    it('emits no outbox event', async () => {
      const target = await context.seedTarget();

      await reject(target);

      expect(
        await context.count(
          sql`select count(*)::text as count from outbox_events
               where event_type in ('quotation.rejected', 'quotation.accepted')`,
        ),
      ).toBe(0);
    });

    it('leaves the frozen amounts and the line items exactly as they were', async () => {
      const target = await context.seedTarget({ priced: { unitPrice: 210_000, quantity: 3 } });
      const [before] = await context.rows<{ total_amount: string; deposit_amount: string }>(
        sql`select total_amount, deposit_amount from quotation_versions where id = ${target.versionId}`,
      );
      const linesBefore = await context.count(
        sql`select count(*)::text as count from quotation_line_items
             where quotation_version_id = ${target.versionId}`,
      );

      await reject(target);

      const [after] = await context.rows<{ total_amount: string; deposit_amount: string }>(
        sql`select total_amount, deposit_amount from quotation_versions where id = ${target.versionId}`,
      );
      expect(after!.total_amount).toBe(before!.total_amount);
      expect(after!.deposit_amount).toBe(before!.deposit_amount);
      expect(
        await context.count(
          sql`select count(*)::text as count from quotation_line_items
               where quotation_version_id = ${target.versionId}`,
        ),
      ).toBe(linesBefore);
    });
  });

  describe('natural duplicate behaviour — no quotation.reject namespace', () => {
    it('refuses a repeat rejection with INVALID_TRANSITION and duplicates nothing', async () => {
      const target = await context.seedTarget();
      await reject(target);

      expect(await failureOf(() => reject(target))).toBe('INVALID_TRANSITION');

      expect(
        await context.count(
          sql`select count(*)::text as count from audit_events
               where action = 'quotation.rejected' and target_id = ${target.versionId}`,
        ),
      ).toBe(1);
      expect((await rowsOf(target)).version.status).toBe('REJECTED');
    });

    it('refuses rejecting an already-accepted version', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      await accept(target);

      expect(await failureOf(() => reject(target))).toBe('INVALID_TRANSITION');

      const state = await rowsOf(target);
      expect(state.version.status).toBe('ACCEPTED');
      expect(state.quotation.status).toBe('ACCEPTED');
      expect(state.request.status).toBe('QUOTE_ACCEPTED');
    });

    it('refuses a superseded version and leaves the live offer untouched', async () => {
      const target = await context.seedTarget();
      const newer = await context.sendNewerVersion(target, 190_000);

      expect(await failureOf(() => reject(target))).toBe('INVALID_TRANSITION');

      const state = await rowsOf(target);
      expect(state.version.status).toBe('SUPERSEDED');
      // The current offer is still live and the header is still SENT: a stale
      // page must not be able to reject a price it never saw.
      expect(state.quotation.status).toBe('SENT');
      expect(state.quotation.current_version_id).toBe(newer);
      const [current] = await context.rows<{ status: string }>(
        sql`select status from quotation_versions where id = ${newer}`,
      );
      expect(current!.status).toBe('SENT');
    });

    it('refuses another customer’s version and touches nothing of theirs', async () => {
      const theirs = await context.seedTarget();
      const mine = await context.seedTarget();

      // The chain resolves *my* quotation from my grant, so their version is
      // simply not the one it reached — refused before any write, and with the
      // same code a repeat rejection gets, so the two are indistinguishable.
      expect(await failureOf(() => reject(mine, theirs.versionId))).toBe('INVALID_TRANSITION');
      expect((await rowsOf(theirs)).version.status).toBe('SENT');
      expect((await rowsOf(mine)).version.status).toBe('SENT');
    });

    it('answers SECURE_LINK_UNAVAILABLE for a revoked grant', async () => {
      const target = await context.seedTarget();
      await context.revokeGrant(target.grantId);

      expect(await failureOf(() => reject(target))).toBe('SECURE_LINK_UNAVAILABLE');
      expect((await rowsOf(target)).version.status).toBe('SENT');
    });

    it('lets the workshop send a further version after a rejection', async () => {
      // The point of not projecting the request: the quotation stage is still
      // open, so a revised offer is an ordinary APP6-B03 send.
      const target = await context.seedTarget();
      await reject(target);

      const newer = await context.sendNewerVersion(target, 205_000);

      const [current] = await context.rows<{ status: string }>(
        sql`select status from quotation_versions where id = ${newer}`,
      );
      expect(current!.status).toBe('SENT');
      expect((await rowsOf(target)).request.status).toBe('QUOTED');
    });
  });

  describe('atomic rollback of the acceptance transaction', () => {
    it('rolls back every acceptance-owned fact when a late write fails', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const recorder = context.get<QuotationDecisionRecorder>(QuotationDecisionRecorder);

      // Injected at the last write inside the transaction: by this point the
      // version is ACCEPTED, the evidence row is inserted, the header is
      // ACCEPTED, the request is QUOTE_ACCEPTED, the transition row exists and
      // the idempotency claim is held. All of it must disappear together.
      const injected = jest
        .spyOn(recorder, 'recordAcceptance')
        .mockRejectedValueOnce(new Error('injected failure before commit'));

      await expect(accept(target)).rejects.toThrow('injected failure before commit');
      expect(injected).toHaveBeenCalledTimes(1);
      injected.mockRestore();

      const state = await rowsOf(target);
      expect(state.version.status).toBe('SENT');
      expect(state.quotation.status).toBe('SENT');
      expect(state.request.status).toBe('QUOTED');
      expect(
        await context.count(
          sql`select count(*)::text as count from quotation_acceptances
               where quotation_version_id = ${target.versionId}`,
        ),
      ).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${target.requestId}`,
        ),
      ).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from audit_events
               where action = 'quotation.accepted' and target_id = ${target.versionId}`,
        ),
      ).toBe(0);
      // No falsely COMPLETED claim, and no orphaned IN_PROGRESS one either.
      expect(
        await context.count(
          sql`select count(*)::text as count from idempotency_records
               where operation_namespace = 'quotation.accept' and scope_key = ${target.versionId}`,
        ),
      ).toBe(0);
    });

    it('leaves a genuine retry possible after the rollback', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const recorder = context.get<QuotationDecisionRecorder>(QuotationDecisionRecorder);
      const injected = jest
        .spyOn(recorder, 'recordAcceptance')
        .mockRejectedValueOnce(new Error('injected failure before commit'));
      await expect(accept(target)).rejects.toThrow('injected failure before commit');
      injected.mockRestore();

      const retried = await accept(target);

      // A first acceptance, not a replay: the failed attempt left no claim.
      expect(retried.replayed).toBe(false);
      expect(retried.versionStatus).toBe('ACCEPTED');
      const state = await rowsOf(target);
      expect(state.request.status).toBe('QUOTE_ACCEPTED');
      expect(
        await context.count(
          sql`select count(*)::text as count from quotation_acceptances
               where quotation_version_id = ${target.versionId}`,
        ),
      ).toBe(1);
    });
  });
});

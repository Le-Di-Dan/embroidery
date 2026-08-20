/**
 * `APP6-B05` — quotation acceptance (`TR-LC12-03`), against a real database.
 *
 * Every assertion below is about **committed rows**, not about what the use case
 * returned: the response is checked too, but the acceptance evidence, the
 * version state, the header state, the request state, the transition row, the
 * audit row, the idempotency record and the *absence* of an outbox event are all
 * read back out of PostgreSQL.
 *
 * Nothing is stubbed. The token digest is the real peppered HMAC, the step-up
 * window is the real published policy, the transaction is a real one and the
 * repository is the delivered AGG-14 adapter.
 */
import { sql } from 'drizzle-orm';

import {
  createQuotationDecisionContext,
  mintToken,
  STEP_UP_WINDOW_SECONDS,
  type QuotationDecisionTestContext,
  type SeededDecisionTarget,
} from './quotation-decision-context';
import { isQuotationDecisionError } from '../../domain/decision/quotation-decision.errors';
import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import type { QuotationVersionId } from '../../domain/repositories/quotation.repository';

/** A step-up answered a minute ago: comfortably inside the published window. */
const FRESH = 60;

describe('APP6-B05 quotation acceptance (integration)', () => {
  let context: QuotationDecisionTestContext;

  beforeAll(async () => {
    context = await createQuotationDecisionContext('app6-b05-accept');
    await context.publishPolicies();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  function accept(target: SeededDecisionTarget, versionId?: QuotationVersionId) {
    return context.asRequest(() =>
      context.acceptance.accept({
        token: target.token,
        versionId: versionId ?? target.versionId,
      }),
    );
  }

  async function failureOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      if (isQuotationDecisionError(error)) {
        return error.failure;
      }
      if (isSecureLinkError(error)) {
        return error.code;
      }
      throw error;
    }
    throw new Error('Expected the acceptance to be refused.');
  }

  async function stateOf(target: SeededDecisionTarget) {
    const [version] = await context.rows<{ status: string; accepted_at: unknown }>(
      sql`select status, accepted_at from quotation_versions where id = ${target.versionId}`,
    );
    const [quotation] = await context.rows<{ status: string; current_version_id: string }>(
      sql`select status, current_version_id from quotations where id = ${target.quotationId}`,
    );
    const [request] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${target.requestId}`,
    );
    return {
      version: version!,
      quotation: quotation!,
      request: request!,
      acceptances: await context.count(
        sql`select count(*)::text as count from quotation_acceptances
             where quotation_version_id = ${target.versionId}`,
      ),
      transitions: await context.count(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${target.requestId} and to_status = 'QUOTE_ACCEPTED'`,
      ),
      audits: await context.count(
        sql`select count(*)::text as count from audit_events
             where action = 'quotation.accepted' and target_id = ${target.versionId}`,
      ),
    };
  }

  describe('the committed acceptance', () => {
    it('moves the version, the header and the request in one transaction', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      const view = await accept(target);

      expect(view.versionId).toBe(target.versionId);
      expect(view.versionStatus).toBe('ACCEPTED');
      expect(view.quotationStatus).toBe('ACCEPTED');
      expect(view.requestStatus).toBe('QUOTE_ACCEPTED');
      expect(view.replayed).toBe(false);

      const state = await stateOf(target);
      expect(state.version.status).toBe('ACCEPTED');
      expect(state.version.accepted_at).not.toBeNull();
      expect(state.quotation.status).toBe('ACCEPTED');
      expect(state.request.status).toBe('QUOTE_ACCEPTED');
      expect(state.acceptances).toBe(1);
      expect(state.transitions).toBe(1);
      expect(state.audits).toBe(1);
    });

    it('writes TBL-053 evidence bound to server-validated facts, not caller claims', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const challengeId = (
        await context.rows<{ id: string }>(
          sql`select id from contact_verification_challenges
               where normalized_value = ${target.normalizedValue} and purpose = 'STEP_UP'`,
        )
      )[0]!.id;

      await accept(target);

      const [evidence] = await context.rows<{
        customer_id: string;
        grant_id: string;
        step_up_challenge_id: string;
        accepted_total_amount: string;
        currency_code: string;
      }>(sql`select customer_id, grant_id, step_up_challenge_id, accepted_total_amount,
                    currency_code
               from quotation_acceptances where quotation_version_id = ${target.versionId}`);

      // Every one of these comes from the grant row, the version row or the
      // customer's own verification history. None was in the request body,
      // which carries a token and a version id and nothing else.
      expect(evidence!.customer_id).toBe(target.customerId);
      expect(evidence!.grant_id).toBe(target.grantId);
      expect(evidence!.step_up_challenge_id).toBe(challengeId);
      expect(evidence!.currency_code).toBe('VND');
    });

    it('records the frozen version’s own total, exactly, as a string', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        priced: { unitPrice: 123_457, quantity: 7 },
      });
      const [frozen] = await context.rows<{ total_amount: string }>(
        sql`select total_amount from quotation_versions where id = ${target.versionId}`,
      );

      const view = await accept(target);

      const [evidence] = await context.rows<{ accepted_total_amount: string }>(
        sql`select accepted_total_amount from quotation_acceptances
             where quotation_version_id = ${target.versionId}`,
      );
      expect(view.acceptedTotalAmount).toBe(frozen!.total_amount);
      expect(evidence!.accepted_total_amount).toBe(frozen!.total_amount);
      expect(typeof view.acceptedTotalAmount).toBe('string');
      // Not re-derived: the string is the persisted one, decimals and all.
      expect(view.acceptedTotalAmount).toMatch(/^\d+\.\d{2}$/);
    });

    it('appends the transition with a SYSTEM actor, never the customer', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      await accept(target);

      const [transition] = await context.rows<{
        from_status: string;
        to_status: string;
        actor_kind: string;
        admin_id: string | null;
        customer_id: string | null;
        system_job_key: string | null;
      }>(sql`select from_status, to_status, actor_kind, admin_id, customer_id, system_job_key
                from custom_request_transitions
               where custom_request_id = ${target.requestId} and to_status = 'QUOTE_ACCEPTED'`);
      expect(transition!.from_status).toBe('QUOTED');
      expect(transition!.actor_kind).toBe('SYSTEM');
      expect(transition!.admin_id).toBeNull();
      expect(transition!.customer_id).toBeNull();
      expect(transition!.system_job_key).toBe('quotation.accept');
    });

    it('audits the decision as the customer’s, carrying the grant', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      await accept(target);

      const [audit] = await context.rows<{
        actor_kind: string;
        customer_id: string;
        grant_id: string;
        target_kind: string;
      }>(sql`select actor_kind, customer_id, grant_id, target_kind
                from audit_events
               where action = 'quotation.accepted' and target_id = ${target.versionId}`);
      // The audit says the *customer* accepted; the transition says the
      // *system* moved the request. Two different facts, two different actors.
      expect(audit!.actor_kind).toBe('CUSTOMER');
      expect(audit!.customer_id).toBe(target.customerId);
      expect(audit!.grant_id).toBe(target.grantId);
      expect(audit!.target_kind).toBe('QUOTATION_VERSION');
    });

    it('emits no outbox event and creates no order, payment or reservation', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      await accept(target);

      expect(
        await context.count(
          sql`select count(*)::text as count from outbox_events
               where event_type in ('quotation.accepted', 'quotation.rejected')`,
        ),
      ).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from orders where custom_request_id = ${target.requestId}`,
        ),
      ).toBe(0);
      expect(
        await context.count(sql`select count(*)::text as count from payment_obligations`),
      ).toBe(0);
      expect(
        await context.count(sql`select count(*)::text as count from inventory_reservations`),
      ).toBe(0);
    });
  });

  describe('GRD-003 — step-up freshness', () => {
    it('refuses REVERIFICATION_REQUIRED when the customer has never stepped up', async () => {
      const target = await context.seedTarget();

      expect(await failureOf(() => accept(target))).toBe('REVERIFICATION_REQUIRED');

      const state = await stateOf(target);
      expect(state.version.status).toBe('SENT');
      expect(state.request.status).toBe('QUOTED');
      expect(state.acceptances).toBe(0);
      expect(state.transitions).toBe(0);
    });

    it('refuses when the step-up is older than the published window', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: STEP_UP_WINDOW_SECONDS + 60,
      });

      expect(await failureOf(() => accept(target))).toBe('REVERIFICATION_REQUIRED');
      expect((await stateOf(target)).acceptances).toBe(0);
    });

    it('refuses when the only recent verification was a SUBMISSION, not a STEP_UP', async () => {
      const target = await context.seedTarget();
      // The OTP that created the identity is not evidence the person is present
      // now — the distinction `StepUpWindow` pins as a constant.
      await context.rows(sql`
        update contact_verification_challenges set purpose = 'SUBMISSION'
         where normalized_value = ${target.normalizedValue}
      `);
      await context.addStepUp(target, FRESH);
      await context.rows(sql`
        update contact_verification_challenges set purpose = 'SUBMISSION'
         where normalized_value = ${target.normalizedValue}
      `);

      expect(await failureOf(() => accept(target))).toBe('REVERIFICATION_REQUIRED');
    });

    it('does not accept another customer’s fresh step-up', async () => {
      const stranger = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const target = await context.seedTarget();

      // A live, fresh STEP_UP exists in the database — it just belongs to a
      // contact this grant's customer does not hold. There is no body field
      // through which it could be offered, and the derivation is per-customer.
      expect(stranger.customerId).not.toBe(target.customerId);
      expect(await failureOf(() => accept(target))).toBe('REVERIFICATION_REQUIRED');
    });
  });

  describe('GRD-006 — the exact current, unexpired version', () => {
    it('CC-05 — refuses QUOTE_VERSION_STALE once a newer version has been sent', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const newer = await context.sendNewerVersion(target, 175_000);

      expect(await failureOf(() => accept(target))).toBe('QUOTE_VERSION_STALE');

      const state = await stateOf(target);
      // The stale version was superseded by the send and is not accepted; the
      // newer one is untouched, and the request never moved.
      expect(state.version.status).toBe('SUPERSEDED');
      expect(state.acceptances).toBe(0);
      expect(state.request.status).toBe('QUOTED');
      const [current] = await context.rows<{ status: string }>(
        sql`select status from quotation_versions where id = ${newer}`,
      );
      expect(current!.status).toBe('SENT');
    });

    it('CC-05 — accepting the newer version instead succeeds', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const newer = await context.sendNewerVersion(target, 175_000);

      const view = await accept(target, newer);

      expect(view.versionId).toBe(newer);
      expect(view.versionStatus).toBe('ACCEPTED');
    });

    it('CC-06 — refuses once the validity window has closed', async () => {
      // Sent two hours ago with a one-hour window: `now >= valid_until` is
      // expressed by constructing a legal window that has already elapsed, not
      // by waiting and not by back-dating a frozen column.
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        sentMinutesAgo: 120,
        validityMinutes: 60,
      });

      expect(await failureOf(() => accept(target))).toBe('QUOTE_VERSION_STALE');

      const state = await stateOf(target);
      expect(state.version.status).toBe('SENT');
      expect(state.version.accepted_at).toBeNull();
      expect(state.acceptances).toBe(0);
      expect(state.request.status).toBe('QUOTED');
    });

    it('CC-06 — a window that is still open one minute from closing is accepted', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        sentMinutesAgo: 119,
        validityMinutes: 120,
      });

      await expect(accept(target)).resolves.toMatchObject({ versionStatus: 'ACCEPTED' });
    });

    it('CC-06 — correctness does not depend on the expiry sweep having run', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        sentMinutesAgo: 120,
        validityMinutes: 60,
      });
      const [before] = await context.rows<{ status: string }>(
        sql`select status from quotation_versions where id = ${target.versionId}`,
      );

      expect(await failureOf(() => accept(target))).toBe('QUOTE_VERSION_STALE');

      // Still `SENT` throughout: `TR-LC12-05` never ran, and the refusal did
      // not write `EXPIRED` either. The decision was made from the clock.
      expect(before!.status).toBe('SENT');
      const [after] = await context.rows<{ status: string }>(
        sql`select status from quotation_versions where id = ${target.versionId}`,
      );
      expect(after!.status).toBe('SENT');
    });

    it('refuses a version belonging to another customer’s quotation', async () => {
      const other = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      expect(await failureOf(() => accept(target, other.versionId))).toBe('QUOTE_VERSION_STALE');

      // The foreign quotation is untouched — the refusal happened before any
      // write, and it named nothing about the row it declined to reach.
      expect((await stateOf(other)).acceptances).toBe(0);
      expect((await stateOf(target)).acceptances).toBe(0);
    });
  });

  describe('GRD-002 — the grant is the whole authority', () => {
    it('answers SECURE_LINK_UNAVAILABLE for an unknown token', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      const failure = await failureOf(() =>
        context.asRequest(() =>
          context.acceptance.accept({ token: mintToken(), versionId: target.versionId }),
        ),
      );
      expect(failure).toBe('SECURE_LINK_UNAVAILABLE');
      expect((await stateOf(target)).acceptances).toBe(0);
    });

    it('answers identically for a revoked grant — no cause is disclosed', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      await context.revokeGrant(target.grantId);

      expect(await failureOf(() => accept(target))).toBe('SECURE_LINK_UNAVAILABLE');
      expect((await stateOf(target)).acceptances).toBe(0);
    });

    it('answers identically for an expired grant', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        grantExpiresInMinutes: -5,
      });

      expect(await failureOf(() => accept(target))).toBe('SECURE_LINK_UNAVAILABLE');
      expect((await stateOf(target)).acceptances).toBe(0);
    });

    it('cannot reach another request’s quotation with a valid token', async () => {
      const mine = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      const theirs = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      // My token, their version. The chain resolves *my* quotation from the
      // grant, so their version simply is not the one it reached.
      expect(await failureOf(() => accept(mine, theirs.versionId))).toBe('QUOTE_VERSION_STALE');
      expect((await stateOf(theirs)).acceptances).toBe(0);
    });
  });

  describe('TR-LC11-06 — the request projection', () => {
    it('refuses INVALID_TRANSITION when the request has left QUOTED', async () => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH,
        requestStatus: 'CANCELLED',
      });

      expect(await failureOf(() => accept(target))).toBe('INVALID_TRANSITION');

      const state = await stateOf(target);
      // Atomic: no accepted quotation left standing beside a request that
      // cannot carry it.
      expect(state.version.status).toBe('SENT');
      expect(state.quotation.status).toBe('SENT');
      expect(state.acceptances).toBe(0);
      expect(state.request.status).toBe('CANCELLED');
    });
  });

  describe('quotation.accept idempotency', () => {
    it('replays the committed acceptance and writes nothing a second time', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      const first = await accept(target);
      const second = await accept(target);

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.versionId).toBe(first.versionId);
      expect(second.acceptedTotalAmount).toBe(first.acceptedTotalAmount);
      expect(second.acceptedAt.toISOString()).toBe(first.acceptedAt.toISOString());
      expect(second.requestStatus).toBe('QUOTE_ACCEPTED');

      const state = await stateOf(target);
      expect(state.acceptances).toBe(1);
      expect(state.transitions).toBe(1);
      expect(state.audits).toBe(1);
    });

    it('claims exactly one record, scoped to the version', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });

      await accept(target);
      await accept(target);

      const records = await context.rows<{ scope_key: string; status: string }>(
        sql`select scope_key, status from idempotency_records
             where operation_namespace = 'quotation.accept' and scope_key = ${target.versionId}`,
      );
      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('COMPLETED');
    });

    it('replays even after the step-up window has closed', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH });
      await accept(target);

      // The proof of presence has since lapsed. The acceptance is already
      // committed, so re-serving it is not a new sensitive action.
      await context.rows(sql`
        update contact_verification_challenges
           set verified_at = now() - interval '2 days'
         where normalized_value = ${target.normalizedValue}
      `);

      const replay = await accept(target);
      expect(replay.replayed).toBe(true);
      expect((await stateOf(target)).acceptances).toBe(1);
    });

    it('leaves no record behind when the acceptance is refused', async () => {
      const target = await context.seedTarget();

      expect(await failureOf(() => accept(target))).toBe('REVERIFICATION_REQUIRED');

      // The claim was taken and rolled back with everything else, so a genuine
      // retry is still possible rather than blocked by a phantom IN_PROGRESS.
      expect(
        await context.count(
          sql`select count(*)::text as count from idempotency_records
               where operation_namespace = 'quotation.accept' and scope_key = ${target.versionId}`,
        ),
      ).toBe(0);

      await context.addStepUp(target, FRESH);
      await expect(accept(target)).resolves.toMatchObject({ replayed: false });
    });
  });
});

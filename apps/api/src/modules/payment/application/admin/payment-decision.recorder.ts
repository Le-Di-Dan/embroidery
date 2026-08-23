/**
 * The durable evidence an Admin payment decision leaves (`APP7-B04` §25, §26).
 *
 * Two writes, both joining the caller's transaction: the audit row and — for a
 * successful verification only — the SE-007 outbox fact. Split from the use
 * cases so the "what is recorded" rule is one file rather than a paragraph
 * repeated in two, exactly as `design-version-send.recorder.ts` and
 * `quotation-decision.recorder.ts` are arranged.
 *
 * ### Audit is not a judgement call here
 *
 * `DB3_TRANSITION_GUARD_CATALOG.md` marks GRD-011's Audit column **yes**, and
 * `DB3_LIFECYCLE_SPECIFICATIONS.md` marks `TR-LC16-03` *"yes (critical)"* and
 * `TR-LC16-05`/`-06` *"yes R"* — audited **with reason**. So both decisions
 * append, and the review paths carry the operator's stated reason.
 *
 * ### What never enters either row
 *
 * `DB3_AUDIT_SPECIFICATION.md` requires the payment application's provider
 * payload to be redacted (REQ-PAY-007). There is no provider payload in this
 * flow, and the summary carries no merchant bank value, no object key, no
 * evidence byte, no customer contact, no secure token and no Admin session. The
 * observed amount and the observed reference are the operator's own figures
 * about money the store received — the same facts `payment_reconciliations`
 * already holds — and the *reason* text is deliberately absent from both: it is
 * free-form operator prose, it is stored verbatim in the reconciliation row that
 * owns it, and copying it into an outbox payload would put it one consumer away
 * from a customer-facing notification.
 *
 * ### `payment.verified` is appended exactly once, and only on success
 *
 * The append sits after `satisfy()` in the same transaction. `satisfy()` locks
 * the obligation and refuses a second application, so at most one transaction
 * per deposit can ever reach this line — the event's exactly-once property is
 * the obligation's row lock, not a counter here. A retry that finds the
 * verification already committed returns before reaching this recorder, and the
 * review paths never call it.
 *
 * There is no `payment.review-required` event. `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`
 * SE-007 publishes `payment.verified` / `payment.failed` and nothing else, and
 * `APP7-B04` §25 forbids inventing one for symmetry. An admin alert on a review
 * is the audit row, which is what LC-16 `TR-LC16-05` actually specifies.
 *
 * No network call is made from here. The outbox row is the whole of the
 * after-commit handoff (INV-23).
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';

/** `TR-LC16-03`. Lowercase dot-namespaced, as `DB3_AUDIT_SPECIFICATION.md` locks. */
export const PAYMENT_ATTEMPT_VERIFIED_ACTION = 'payment_attempt.verified';
/** `TR-LC16-05` — a contradiction, or a deliberate Admin escalation. */
export const PAYMENT_ATTEMPT_REVIEW_REQUIRED_ACTION = 'payment_attempt.review_required';

/** SE-007, the accepted event type. Not `payment.satisfied`, not `deposit.paid`. */
export const PAYMENT_VERIFIED_EVENT_TYPE = 'payment.verified';

/** The payload contract's version. One shape, so far. */
const PAYMENT_VERIFIED_SCHEMA_VERSION = 1;

export interface PaymentDecisionFacts {
  readonly attemptId: string;
  readonly obligationId: string;
  readonly orderId: string;
  /** What the operator observed. Recorded, never treated as authority. */
  readonly observedAmount: string | undefined;
  readonly observedTransferReference: string | undefined;
  /** The LC-16 status the attempt held before the decision. */
  readonly fromStatus: string;
  /** The LC-16 status it holds after. */
  readonly toStatus: string;
}

@Injectable()
export class PaymentDecisionRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly clock: AuditClock,
    private readonly requestContext: RequestContextService,
  ) {}

  /** @requiresTransaction — atomic with the settlement it explains. */
  async recordVerified(facts: PaymentDecisionFacts, adminId: string): Promise<void> {
    await this.appendAudit(PAYMENT_ATTEMPT_VERIFIED_ACTION, facts, adminId, undefined);

    // SE-007. The payload holds canonical references only: a consumer resolves
    // the amount, the code and the customer from the ids itself, so the row
    // cannot go stale and cannot leak what it does not carry.
    await this.outbox.append({
      eventType: PAYMENT_VERIFIED_EVENT_TYPE,
      aggregateKind: 'PAYMENT_ATTEMPT',
      aggregateId: facts.attemptId,
      payload: {
        paymentAttemptId: facts.attemptId,
        paymentObligationId: facts.obligationId,
        obligationKind: 'DEPOSIT',
        orderId: facts.orderId,
      },
      payloadSchemaVersion: PAYMENT_VERIFIED_SCHEMA_VERSION,
    });
  }

  /**
   * @requiresTransaction — atomic with the move into review.
   *
   * `reason` is the operator's own stated reason, which LC-16 `TR-LC16-05`/`-06`
   * require the audit row to carry ("yes R"). It reaches `audit_events.reason`,
   * the column built for it, and does not enter the redacted summary.
   */
  async recordReviewRequired(
    facts: PaymentDecisionFacts,
    adminId: string,
    reason: string,
  ): Promise<void> {
    await this.appendAudit(PAYMENT_ATTEMPT_REVIEW_REQUIRED_ACTION, facts, adminId, reason);
  }

  private async appendAudit(
    action: string,
    facts: PaymentDecisionFacts,
    adminId: string,
    reason: string | undefined,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action,
      // The **attempt**, not the order: the audited fact is what happened to
      // this payment, and `AUDIT_TARGET_KINDS` has carried `PAYMENT_ATTEMPT`
      // since DB7 for exactly these transitions.
      targetKind: 'PAYMENT_ATTEMPT',
      targetId: facts.attemptId,
      reason,
      summary: {
        paymentObligationId: facts.obligationId,
        orderId: facts.orderId,
        fromStatus: facts.fromStatus,
        toStatus: facts.toStatus,
        observedAmount: facts.observedAmount ?? null,
        observedTransferReference: facts.observedTransferReference ?? null,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}

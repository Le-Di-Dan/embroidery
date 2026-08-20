/**
 * The durable evidence a committed customer decision leaves (`APP6-B05` §15,
 * `APP6-G01` §9).
 *
 * **One row, and the absence of a second row is the point.**
 *
 * `QuotationSendRecorder` writes an audit row *and* an outbox event, because
 * `SE-004` names `quotation.sent`. This writes the audit row and **nothing
 * else**: `APP6-G01` §9 records `quotation.accepted` and `quotation.rejected` as
 * `no` under "Required?", and gives the reason — `SE-004` does not list either,
 * `TR-LC12-03` records evidence and audit, and APP7 reads the accepted version
 * directly rather than reacting to an event.
 *
 * So there is no `OutboxEventStore` in this class's constructor, and a future
 * edit cannot emit an event from here without adding one. That is deliberate:
 * emitting `quotation.accepted` "for symmetry with the send" would create a
 * side-effect contract no consumer was designed against, and would make APP7's
 * order creation reachable from a phase that must stop before it.
 *
 * ### Actor
 *
 * `CUSTOMER`, carrying the grant. Both decisions *are* customer commands — the
 * customer accepted or declined a price — and the audit trail is where that is
 * true. The **Custom Request transition** appended in the same transaction is
 * the opposite: `TR-LC11-06`'s actor is `SYSTEM`, because the request moving is
 * a consequence of the acceptance committing rather than something anyone asked
 * for (`APP6-B05` §12). The two actors describe two different facts and must not
 * be unified.
 *
 * ### What the summary may carry
 *
 * `DB3_AUDIT_SPECIFICATION.md` audits quotation accept with a "version + totals
 * summary". The total travels as the **exact persisted string**, never
 * re-derived and never a JSON number. Nothing else does: no contact value, no
 * token, no digest, no challenge id, no line items, no customer note.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';

/** The audit actions. Named for the facts `APP6-G01` §9 declines to emit. */
export const QUOTATION_ACCEPTED_ACTION = 'quotation.accepted';
export const QUOTATION_REJECTED_ACTION = 'quotation.rejected';

export interface RecordQuotationDecisionInput {
  readonly quotationId: string;
  readonly versionId: string;
  readonly version: number;
  readonly customerId: string;
  readonly grantId: string;
  readonly decidedAt: Date;
}

export interface RecordQuotationAcceptanceInput extends RecordQuotationDecisionInput {
  /** Exact `numeric(14,2)`, straight off the frozen row. */
  readonly currencyCode: string;
  readonly acceptedTotalAmount: string;
}

@Injectable()
export class QuotationDecisionRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Appends the critical acceptance audit row.
   *
   * @requiresTransaction — an audited acceptance that rolled back would be a
   * false record of a customer agreeing to a price.
   */
  async recordAcceptance(input: RecordQuotationAcceptanceInput): Promise<void> {
    await this.events.append({
      // The decision instant, not a second clock: `accepted_at` on the version,
      // on the TBL-053 row and this `occurred_at` are the same `Date`.
      occurredAt: input.decidedAt,
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: QUOTATION_ACCEPTED_ACTION,
      targetKind: 'QUOTATION_VERSION',
      targetId: input.versionId,
      summary: {
        quotationId: input.quotationId,
        version: input.version,
        currencyCode: input.currencyCode,
        acceptedTotalAmount: input.acceptedTotalAmount,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * Appends the rejection audit row.
   *
   * No amount in the summary: a rejection agrees to nothing, so there is no
   * accepted total, and republishing the declined price adds a money fact to a
   * record whose whole content is that the customer said no. The version number
   * identifies which price it was for anyone who needs it.
   *
   * This row is also the **only** place the rejection instant is durable —
   * `quotation_versions` has `accepted_at`, `superseded_at`, `expired_at` and no
   * rejected timestamp (`APP6-B05` owns no migration).
   *
   * @requiresTransaction
   */
  async recordRejection(input: RecordQuotationDecisionInput): Promise<void> {
    await this.events.append({
      occurredAt: input.decidedAt,
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: QUOTATION_REJECTED_ACTION,
      targetKind: 'QUOTATION_VERSION',
      targetId: input.versionId,
      summary: { quotationId: input.quotationId, version: input.version },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}

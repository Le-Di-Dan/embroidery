/**
 * The durable evidence a committed quotation send leaves (`APP6-G01` §4, §8).
 *
 * Two rows, both inside the send transaction, and one place that knows their
 * vocabulary so no use case hand-assembles either — the same shape
 * `ProductPublicationRecorder` (`APP2-B03`) and `RequestModerationRecorder`
 * (`APP5-B05`) already use.
 *
 * - the **audit** row: `quotation.sent` on the `QUOTATION_VERSION` that was
 *   frozen, actor `ADMIN`. `DB3_AUDIT_SPECIFICATION.md` audits quotation send
 *   with a "version + totals summary", which is what the summary carries;
 * - the **outbox** row: `SE-004` `quotation.sent` on the `QUOTATION`, which is
 *   the aggregate `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` §SE-004 names. Delivery is
 *   after-commit and belongs to the delivered APP4 notification worker.
 *
 * ### Outbox row only, no notification intent
 *
 * Identical to `RequestModerationRecorder`'s reasoning: APP4's
 * `NotificationRequest` is secret-bearing by construction — it requires a
 * `secret`, a `secretKind` and a `reference` from a closed union — and the
 * customer-facing secure link a quotation notification eventually carries is
 * issued by `APP6-B04`, which owns customer access. Creating an intent here
 * would mean inventing a secretless delivery path, a change to APP4's
 * notification architecture that no APP6 checkpoint owns. The durable business
 * fact is this row; the consumer is a later hand-off, and the row is written now
 * precisely so it can be added without reopening this transaction.
 *
 * ### What the payload may carry
 *
 * SE-004's own annotation is "amounts OK; no doc content". The total and the
 * deposit split travel as the **exact persisted strings**, never re-derived and
 * never a JSON number. Nothing else does: no customer id, no contact value, no
 * grant, no token, no storage key, no line items, no design document and no
 * operator identity. A consumer reads the quotation for anything more.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';

/** `SE-004`. The audit action and the event type are deliberately identical. */
export const QUOTATION_SENT_EVENT = 'quotation.sent';

/** Carried in the row and in the payload itself, as every other event does. */
export const QUOTATION_SENT_PAYLOAD_VERSION = 1;

export interface RecordQuotationSendInput {
  readonly quotationId: string;
  readonly quotationCode: string;
  readonly customRequestId: string;
  readonly versionId: string;
  readonly version: number;
  /** Exact `numeric(14,2)` strings, straight off the frozen row. */
  readonly currencyCode: string;
  readonly totalAmount: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly validUntil: Date;
  readonly sentAt: Date;
  /** The operator who commanded the send. Audit only — never in the payload. */
  readonly adminId: string;
}

@Injectable()
export class QuotationSendRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Appends the audit row and the outbox event for one send.
   *
   * @requiresTransaction — an event that committed without the freeze would
   * announce a price the customer was never sent, and a freeze that committed
   * without its event would be a price nobody is ever told about. INV-23 also
   * forbids calling anything external in here, and nothing does: this writes two
   * rows and returns.
   */
  async record(input: RecordQuotationSendInput): Promise<void> {
    await this.events.append({
      // The send instant, not a second clock: `sent_at`, `valid_from` and this
      // `occurred_at` are the same `Date`, so the evidence cannot disagree with
      // the row about when the price went out.
      occurredAt: input.sentAt,
      actor: { kind: 'ADMIN', adminId: input.adminId },
      action: QUOTATION_SENT_EVENT,
      targetKind: 'QUOTATION_VERSION',
      targetId: input.versionId,
      // Bounded, and the summary DB3 asks for: which version, and what it came
      // to. Never the lines, the customer, the request note or a credential.
      summary: {
        quotationId: input.quotationId,
        version: input.version,
        currencyCode: input.currencyCode,
        totalAmount: input.totalAmount,
        depositAmount: input.depositAmount,
        validUntil: input.validUntil.toISOString(),
      },
      correlationId: this.requestContext.requireRequestId(),
    });

    await this.outbox.append({
      eventType: QUOTATION_SENT_EVENT,
      aggregateKind: 'QUOTATION',
      aggregateId: input.quotationId,
      payload: {
        schemaVersion: QUOTATION_SENT_PAYLOAD_VERSION,
        quotationId: input.quotationId,
        quotationCode: input.quotationCode,
        customRequestId: input.customRequestId,
        quotationVersionId: input.versionId,
        version: input.version,
        currencyCode: input.currencyCode,
        totalAmount: input.totalAmount,
        depositAmount: input.depositAmount,
        remainingAmount: input.remainingAmount,
        validUntil: input.validUntil.toISOString(),
        sentAt: input.sentAt.toISOString(),
      },
      payloadSchemaVersion: QUOTATION_SENT_PAYLOAD_VERSION,
    });
  }
}

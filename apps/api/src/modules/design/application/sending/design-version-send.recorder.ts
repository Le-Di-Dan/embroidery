/**
 * The durable evidence a committed Design Version send leaves (`APP6-B09`
 * §15/§16).
 *
 * Two rows, both inside the send transaction, and one place that knows their
 * vocabulary so no use case hand-assembles either — the shape
 * `QuotationSendRecorder` (`APP6-B03`) and `RequestModerationRecorder`
 * (`APP5-B05`) already use.
 *
 * - the **audit** row: `design_version.sent` on the `DESIGN_VERSION` that was
 *   frozen, actor `ADMIN`, because the operator commanded the *send*.
 *   `DB3_AUDIT_SPECIFICATION.md` audits "design version create/send/decision/
 *   void" with "version refs/state" and, verbatim, *"document content never in
 *   audit (hash ref only)"* — so the hash is here and nothing it hashes is;
 * - the **outbox** row: `SE-004 design.review-ready` on the `DESIGN_VERSION`,
 *   which is the aggregate `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` §SE-004 names
 *   ("per (version)"). Delivery is after-commit and belongs to the delivered
 *   APP4 notification worker.
 *
 * The request's own `TR-LC11-08` transition row is deliberately **not** written
 * here. It is a lifecycle fact owned by `CustomRequestRepository.transition`,
 * with its own actor (`SYSTEM`) and its own guard; duplicating it as a third row
 * in this file would be a second, unguarded account of the same move.
 *
 * ### Outbox row only, no notification intent
 *
 * The accepted `APP6-B03` precedent, for the same reason: APP4's
 * `NotificationRequest` is secret-bearing by construction — it requires a
 * `secret`, a `secretKind` and a `reference` from a closed union — and the
 * customer-facing secure link a design-review notification eventually carries is
 * issued by the existing `REQUEST_ACCESS` grant architecture, which `APP6-B10`
 * consumes. Creating an intent here would mean inventing a secretless delivery
 * path, a change to APP4's notification architecture that no APP6 checkpoint
 * owns. The durable business fact is this row, and it is written now precisely
 * so the consumer can be added without reopening this transaction.
 *
 * ### The event payload carries no hash
 *
 * SE-004's own annotation is *"amounts OK; no doc content"*, and it authorizes a
 * hash for **audit** only. Nothing in the side-effect catalog or the delivered
 * payload convention authorizes one in the event, so none is added: a
 * notification consumer needs to know *which version* is ready, not what it
 * digests to, and `design_versions.document_hash` is one read away for anything
 * that genuinely does. There is no document, no element, no text, no customer
 * id, no contact, no grant, no token, no storage key and no operator identity in
 * the payload either.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import type {
  DesignCaseId,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';

/** `TR-LC08-02`. Lowercase dot-namespaced, as `APP6-B08`'s create action is. */
export const DESIGN_VERSION_SENT_ACTION = 'design_version.sent';

/** `SE-004`, as `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` names it for a design send. */
export const DESIGN_REVIEW_READY_EVENT = 'design.review-ready';

/** Carried in the row and in the payload itself, as every other event does. */
export const DESIGN_REVIEW_READY_PAYLOAD_VERSION = 1;

export interface RecordDesignVersionSendInput {
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly version: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly documentSchemaVersion: number;
  /** `sha256:<64 hex>` — a reference to the frozen document, never its content. */
  readonly documentHash: string;
  readonly sentAt: Date;
  /** The versions `TR-LC08-05` superseded in this same transaction. */
  readonly supersededVersionIds: readonly DesignVersionId[];
  /** True only when this send projected `TR-LC11-08`. */
  readonly requestTransitioned: boolean;
  /** The operator who commanded the send. Audit only — never in the payload. */
  readonly adminId: string;
}

@Injectable()
export class DesignVersionSendRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Appends the audit row and the outbox event for one send.
   *
   * @requiresTransaction — an event that committed without the freeze would
   * announce a design the customer cannot see, and a freeze that committed
   * without its event would be a design nobody is ever told about. INV-23 also
   * forbids calling anything external in here, and nothing does: this writes two
   * rows and returns.
   */
  async record(input: RecordDesignVersionSendInput): Promise<void> {
    await this.events.append({
      // The send instant, not a second clock: `sent_at`, this `occurred_at` and
      // any `superseded_at` written alongside are the same `Date`, so the
      // evidence cannot disagree with the row about when the design went out.
      occurredAt: input.sentAt,
      actor: { kind: 'ADMIN', adminId: input.adminId },
      action: DESIGN_VERSION_SENT_ACTION,
      // The **version**, not the case or the request: the audited fact is that
      // this exact row was frozen and shown to a customer.
      targetKind: 'DESIGN_VERSION',
      targetId: input.designVersionId,
      summary: {
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        version: input.version,
        fromStatus: 'DRAFT',
        toStatus: 'SENT_FOR_REVIEW',
        branch: input.branch,
        documentSchemaVersion: input.documentSchemaVersion,
        // The hash reference DB3 explicitly permits, and the only thing about
        // the document that appears anywhere in this file.
        documentHash: input.documentHash,
        supersededVersionIds: [...input.supersededVersionIds],
        requestTransitioned: input.requestTransitioned,
      },
      correlationId: this.requestContext.requireRequestId(),
    });

    await this.outbox.append({
      eventType: DESIGN_REVIEW_READY_EVENT,
      aggregateKind: 'DESIGN_VERSION',
      aggregateId: input.designVersionId,
      payload: {
        schemaVersion: DESIGN_REVIEW_READY_PAYLOAD_VERSION,
        designVersionId: input.designVersionId,
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        version: input.version,
        sentAt: input.sentAt.toISOString(),
      },
      payloadSchemaVersion: DESIGN_REVIEW_READY_PAYLOAD_VERSION,
    });
  }
}

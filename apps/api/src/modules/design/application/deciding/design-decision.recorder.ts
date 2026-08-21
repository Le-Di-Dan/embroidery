/**
 * The durable evidence a committed customer design decision leaves
 * (`APP6-B11` §23, §24).
 *
 * Two rows per decision, both inside the deciding transaction, and one place
 * that knows their vocabulary so neither use case hand-assembles either — the
 * shape `DesignVersionSendRecorder` (`APP6-B09`), `QuotationSendRecorder`
 * (`APP6-B03`) and `QuotationDecisionRecorder` (`APP6-B05`) already use.
 *
 * ### The audit rows
 *
 * `DB3_AUDIT_SPECIFICATION.md` audits "design version create/send/decision/void"
 * with "version refs/state", and marks the approval row **critical** with
 * "version id + hashes + terms refs". Both rows carry actor `CUSTOMER` with the
 * grant that authorised the decision, and target the `DESIGN_VERSION` that was
 * decided — the audited fact is what happened to that exact row.
 *
 * What is *not* in either summary is the point:
 *
 * - no Design Document, no element, no text and no image reference. The
 *   specification says, verbatim, *"document content never in audit (hash ref
 *   only)"*, so the approval carries `documentHash` and nothing it hashes;
 * - no agreement prose. The terms are referenced by version id and content hash
 *   — "terms refs" is exactly what the specification authorises — and the text a
 *   customer read is in `agreement_versions`, one read away;
 * - no token, no grant secret and no raw challenge secret. The grant id and the
 *   step-up challenge id are *evidence FKs* (INV-20); neither is a credential
 *   and neither can be exchanged for one;
 * - no customer feedback text on the revision row. The customer's words are
 *   `design_reviews.feedback` and belong to the Admin surface that will act on
 *   them, not to a bounded audit summary that is read in aggregate;
 * - no contact, no storage key and no operator identity.
 *
 * ### The outbox rows
 *
 * Exactly one event per committed decision, and each is the one accepted
 * authority already requires (`APP6-G01` §9). Neither is created for symmetry
 * and there is no third:
 *
 * - `SE-004 design.revision-requested` on the `DESIGN_VERSION`, which is the
 *   aggregate `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` §SE-004 names ("per
 *   (version)"). Its consequence is an Admin alert;
 * - `SE-005 design.approved` on the `APPROVAL_SNAPSHOT`, which is the aggregate
 *   §SE-005 names ("per (approval snapshot)"). **This is the APP7 hand-off.**
 *   APP6 emits it and stops: no Order, no order item, no payment obligation, no
 *   reservation, no soft hold and no production job is written here, and none of
 *   those modules is reachable from this module's injector.
 *
 * Delivery is after-commit and belongs to the delivered APP4 worker. Neither
 * payload carries a raw token, a grant secret, a step-up challenge, Design
 * Document content, agreement prose, a storage key or a provider URL. The
 * approval payload does carry `documentHash` — a consumer creating an order
 * needs to name the approved artwork, and `SE-005` has no "no doc content"
 * annotation to weigh against a hash reference that discloses nothing.
 *
 * ### No notification intent
 *
 * The accepted `APP6-B03` / `APP6-B09` precedent, for the same reason: APP4's
 * `NotificationRequest` is secret-bearing by construction — it requires a
 * `secret`, a `secretKind` and a `reference` from a closed union — and neither a
 * revision alert to the workshop nor an approval confirmation carries one.
 * Creating an intent here would mean inventing a secretless delivery path, a
 * change to APP4's notification architecture that no APP6 checkpoint owns. The
 * durable business fact is the outbox row, written now precisely so the consumer
 * can be added without reopening this transaction.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import type { ApprovalSnapshotId } from '../../domain/repositories/approval-snapshot.repository';
import type {
  DesignCaseId,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';

/** `TR-LC08-04`. Lowercase dot-namespaced, as B08's and B09's actions are. */
export const DESIGN_VERSION_APPROVED_ACTION = 'design_version.approved';
/** `TR-LC08-03`, the same family. */
export const DESIGN_VERSION_REVISION_REQUESTED_ACTION = 'design_version.revision_requested';

/** `SE-005`, as `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` names the approval event. */
export const DESIGN_APPROVED_EVENT = 'design.approved';
/** `SE-004`'s third listed event type, for `TR-LC08-03`. */
export const DESIGN_REVISION_REQUESTED_EVENT = 'design.revision-requested';

/** Carried in the row and in the payload itself, as every other event does. */
export const DESIGN_DECISION_PAYLOAD_VERSION = 1;

/** The evidence reference frozen with each accepted term. Ids and hashes only. */
export interface RecordedAgreementReference {
  readonly agreementVersionId: string;
  readonly agreementType: string;
  readonly contentHash: string;
}

export interface RecordApprovalInput {
  readonly approvalSnapshotId: ApprovalSnapshotId;
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly version: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  /** `sha256:<64 hex>` — a reference to the frozen document, never its content. */
  readonly documentHash: string;
  readonly customerId: string;
  readonly grantId: string;
  /** GRD-003's evidence FK. Not a secret and not exchangeable for one. */
  readonly stepUpChallengeId: string;
  readonly acceptedAgreements: readonly RecordedAgreementReference[];
  readonly quantityTotal: number;
  /** True only when this approval projected `TR-LC11-09`. */
  readonly requestTransitioned: boolean;
  readonly approvedAt: Date;
}

export interface RecordRevisionRequestInput {
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly version: number;
  readonly customerId: string;
  readonly grantId: string;
  readonly decidedAt: Date;
}

@Injectable()
export class DesignDecisionRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * The critical approval audit row and the `SE-005` hand-off.
   *
   * @requiresTransaction — an event that committed without the snapshot would
   * ask APP7 to create an order for an approval that does not exist, and a
   * snapshot that committed without its event would be an approval nothing ever
   * acts on. INV-23 also forbids calling anything external in here, and nothing
   * does: this writes two rows and returns.
   */
  async recordApproval(input: RecordApprovalInput): Promise<void> {
    await this.events.append({
      // The approval instant, not a second clock: `approved_at`, `decided_at`,
      // this `occurred_at` and the acceptance rows' `accepted_at` are the same
      // `Date`, so the evidence cannot disagree with itself about when the
      // customer approved.
      occurredAt: input.approvedAt,
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: DESIGN_VERSION_APPROVED_ACTION,
      targetKind: 'DESIGN_VERSION',
      targetId: input.designVersionId,
      summary: {
        approvalSnapshotId: input.approvalSnapshotId,
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        version: input.version,
        fromStatus: 'SENT_FOR_REVIEW',
        toStatus: 'APPROVED',
        branch: input.branch,
        // The hash reference DB3 explicitly permits, and the only thing about
        // the document that appears anywhere in this file.
        documentHash: input.documentHash,
        quantityTotal: input.quantityTotal,
        stepUpChallengeId: input.stepUpChallengeId,
        // "Terms refs", exactly: which version of which type, and what it
        // digests to. No sentence of any agreement is here.
        acceptedAgreements: input.acceptedAgreements.map((agreement) => ({
          agreementVersionId: agreement.agreementVersionId,
          agreementType: agreement.agreementType,
          contentHash: agreement.contentHash,
        })),
        requestTransitioned: input.requestTransitioned,
      },
      correlationId: this.requestContext.requireRequestId(),
    });

    await this.outbox.append({
      eventType: DESIGN_APPROVED_EVENT,
      // The Approval Snapshot, per §SE-005 — not the version. The snapshot is
      // what authorises the order, and it is the row a consumer must read.
      aggregateKind: 'APPROVAL_SNAPSHOT',
      aggregateId: input.approvalSnapshotId,
      payload: {
        schemaVersion: DESIGN_DECISION_PAYLOAD_VERSION,
        approvalSnapshotId: input.approvalSnapshotId,
        designVersionId: input.designVersionId,
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        customerId: input.customerId,
        version: input.version,
        documentHash: input.documentHash,
        quantityTotal: input.quantityTotal,
        approvedAt: input.approvedAt.toISOString(),
      },
      payloadSchemaVersion: DESIGN_DECISION_PAYLOAD_VERSION,
    });
  }

  /**
   * The revision audit row and the `SE-004` Admin alert.
   *
   * @requiresTransaction — for the same reason: an alert without the recorded
   * decision would send the workshop to a review that is still open.
   */
  async recordRevisionRequest(input: RecordRevisionRequestInput): Promise<void> {
    await this.events.append({
      occurredAt: input.decidedAt,
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: DESIGN_VERSION_REVISION_REQUESTED_ACTION,
      targetKind: 'DESIGN_VERSION',
      targetId: input.designVersionId,
      summary: {
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        version: input.version,
        fromStatus: 'SENT_FOR_REVIEW',
        toStatus: 'REVISION_REQUESTED',
        // No `feedback`. The customer's words are on `design_reviews` where the
        // Admin surface reads them; an audit summary is not a place for free
        // text a customer typed.
        requestTransitioned: false,
      },
      correlationId: this.requestContext.requireRequestId(),
    });

    await this.outbox.append({
      eventType: DESIGN_REVISION_REQUESTED_EVENT,
      aggregateKind: 'DESIGN_VERSION',
      aggregateId: input.designVersionId,
      payload: {
        schemaVersion: DESIGN_DECISION_PAYLOAD_VERSION,
        designVersionId: input.designVersionId,
        designCaseId: input.designCaseId,
        customRequestId: input.customRequestId,
        version: input.version,
        decidedAt: input.decidedAt.toISOString(),
      },
      payloadSchemaVersion: DESIGN_DECISION_PAYLOAD_VERSION,
    });
  }
}

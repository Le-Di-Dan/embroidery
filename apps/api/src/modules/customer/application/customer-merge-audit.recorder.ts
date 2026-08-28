/**
 * The durable evidence a merge lifecycle decision leaves (`APP10-B02` §11).
 *
 * Two rows, one per actual state change: a case was opened, or a case was
 * rejected. Nothing else here writes — a detail read, a consequence preview and
 * a refused request all append nothing, because none of them changed anything
 * and `audit_events` outlives its subject by design (G-DB7-46).
 *
 * ### Not `customer_merge_events`, and that is the point
 *
 * TBL-010's `step_kind` set is closed and every member of it —
 * `OWNERSHIP_TRANSFER`, `CONTACT_MOVE`, `GRANT_REVOKE`, `TOMBSTONE` — names a
 * step of *execution*. There is no `OPENED` and no `REJECTED` kind, and B02
 * invents neither: appending a `TOMBSTONE` row for a case that tombstoned
 * nothing would put a false step in an append-only evidence table that
 * `APP10-B03` will read as the record of what a merge actually did. B02
 * therefore writes **zero** `customer_merge_events` rows and audits the
 * operator's action through the ordinary subsystem instead, exactly as
 * `APP10-B02` §10 requires.
 *
 * ### The target is the case, not either customer
 *
 * A merge case is about two identities and neither is more its subject than the
 * other; filing the row under one would hide the decision from the other's
 * timeline and would make the choice of which one arbitrary. `CUSTOMER_MERGE_CASE`
 * joins the closed `AUDIT_TARGET_KINDS` set on the same footing `PRODUCT`,
 * `DESIGN_TEMPLATE` and `CONTACT_VERIFICATION_CHALLENGE` already sit on —
 * `target_kind` is open text with no CHECK by DB4 design, so the list is the
 * application's own G-DB7-46 guard and adding a kind needs no migration. Both
 * customer ids travel in the summary, so a search by either still finds the row.
 *
 * ### What the summary carries, and what it never does
 *
 * Server-derived, bounded values only: the two customer ids and the resulting
 * state. Not a contact in any form — not raw, not normalized, not masked; a mask
 * is still derived from a real person's address and an append-only table has no
 * anonymization path of its own. Not a display name, not the customer's notes,
 * and not a consequence count: the counts are advisory and change between open
 * and execute (`APP10-B02` §8.3), so freezing one into history would preserve a
 * number that was never authoritative.
 *
 * ### The reasons are handled differently, and deliberately
 *
 * The **open** reason is not copied here. It is stored once, in
 * `customer_merge_cases.reason`, where it can be read back with the case and
 * where DB10's retention policy reaches it through the merge row. Duplicating
 * operator free text into an append-only table would create a second copy with
 * no scrub path — the rule `CustomerMaintenanceAuditRecorder` records for
 * `customers.notes`.
 *
 * The **rejection** reason is written to `audit_events.reason`, and that is the
 * only place it can go: `customer_merge_cases` has one `reason` column, it holds
 * the open reason, and overwriting it would destroy why the case was raised in
 * order to record why it was declined. `audit_events.reason` is the repository's
 * canonical home for an operator's stated reason on an action —
 * `SecureGrantAuditRecorder`, `StockAdjustmentRecorder` and
 * `PaymentDecisionRecorder` all use it — and the column is bounded by the
 * request schema before it ever arrives.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { CustomerMergeCaseId } from '../domain/repositories/customer-merge-case.repository';
import type { CustomerId } from '../domain/repositories/customer.repository';

/** The audit `target_kind` for a merge case. See the file header. */
const MERGE_CASE_KIND = 'CUSTOMER_MERGE_CASE' as const;

/**
 * The two actions, lowercase dot-namespaced as every delivered action is.
 *
 * No canonical name existed in an authority — `DB3_AUDIT_SPECIFICATION.md` names
 * no merge actions — so they are introduced here, and they stay distinct from
 * `APP10-B01`'s maintenance actions and from whatever `APP10-B03` names its
 * execution. An operator reading the trail must be able to tell a merge being
 * *proposed* from a merge being *performed*.
 */
export const CUSTOMER_MERGE_CASE_OPENED_ACTION = 'customer.merge_case_opened';
export const CUSTOMER_MERGE_CASE_REJECTED_ACTION = 'customer.merge_case_rejected';

export interface RecordMergeCaseInput {
  readonly mergeCaseId: CustomerMergeCaseId;
  readonly survivorCustomerId: CustomerId;
  readonly loserCustomerId: CustomerId;
}

export interface RecordMergeCaseRejectedInput extends RecordMergeCaseInput {
  /** The operator's stated reason for declining. Bounded by the request schema. */
  readonly rejectionReason: string;
}

@Injectable()
export class CustomerMergeAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — must commit with the case row, or not at all. */
  async recordOpened(input: RecordMergeCaseInput): Promise<void> {
    await this.append(CUSTOMER_MERGE_CASE_OPENED_ACTION, input, 'REQUESTED', undefined);
  }

  /** @requiresTransaction — must commit with the transition, or not at all. */
  async recordRejected(input: RecordMergeCaseRejectedInput): Promise<void> {
    await this.append(
      CUSTOMER_MERGE_CASE_REJECTED_ACTION,
      input,
      'REJECTED',
      input.rejectionReason,
    );
  }

  private async append(
    action: string,
    input: RecordMergeCaseInput,
    resultingStatus: string,
    reason: string | undefined,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentAdminActor(),
      action,
      targetKind: MERGE_CASE_KIND,
      targetId: input.mergeCaseId,
      summary: {
        survivorCustomerId: input.survivorCustomerId,
        loserCustomerId: input.loserCustomerId,
        status: resultingStatus,
      },
      // Omitted rather than null when there is none: the open reason lives on
      // the case row and is deliberately not duplicated here.
      ...(reason === undefined ? {} : { reason }),
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * A hard stop rather than a fallback, for the reason `RevokeSecureGrantUseCase`
   * records: an unattributable merge decision must fail rather than be recorded
   * as `SYSTEM`, or as one of the two customers it is about.
   */
  private currentAdminActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('Deciding a customer merge case requires an authenticated Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}

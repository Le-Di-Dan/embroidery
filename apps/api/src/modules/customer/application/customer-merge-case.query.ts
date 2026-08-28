/**
 * The merge case detail read (`APP10-B02` §7).
 *
 * One case, both participants as masked identity cards, and the read-only
 * consequence preview. It is a read: no transaction, no audit event, no
 * lifecycle. Reading a merge case is not a business action, and a read that
 * wrote evidence would fill `audit_events` — which outlives its subject by
 * design (G-DB7-46) — with operator page views.
 *
 * ### The masked cards are the delivered projection, reused
 *
 * Both participants come from `ADMIN_CUSTOMER_SUMMARY_PORT.findDetailSummary`,
 * the `APP5-B04` projection Customer already implements against its own tables.
 * It applies `APP4-P01`'s `maskContact` inside the adapter and its return type
 * has nowhere to put `normalizedValue` or `displayValue`, so there is no branch
 * on this path that could publish a raw contact. Building a second merge-shaped
 * projection would have meant a second place to keep the masking rule in step
 * with — the thing `APP4-B07` and `APP10-B01` both refused to create.
 *
 * It also publishes strictly less than the support detail read: no `notes`, no
 * `contactId`. A merge screen compares two people; it does not maintain either.
 *
 * ### A participant that cannot be described is still published
 *
 * `findDetailSummary` answers `undefined` for a customer row that is gone. The
 * case is still returned, with that side's card absent, because the case is
 * evidence in its own right and refusing to show it would hide a decision an
 * operator has to act on. It cannot happen through any delivered path —
 * `REL-012` is `RESTRICT` on both halves and customers are anonymized rather
 * than deleted — which is exactly why the branch is a published absence rather
 * than a thrown error nobody could reproduce.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  MergeConsequencePreviewReader,
  type MergeConsequencePreview,
} from './customer-merge-consequence.preview';
import { requireMergeCase } from '../domain/merge/customer-merge.policy';
import {
  ADMIN_CUSTOMER_SUMMARY_PORT,
  type AdminCustomerSummary,
  type AdminCustomerSummaryPort,
} from '../domain/repositories/admin-customer-summary.port';
import {
  CUSTOMER_MERGE_CASE_REPOSITORY,
  type CustomerMergeCaseId,
  type CustomerMergeCaseRepository,
} from '../domain/repositories/customer-merge-case.repository';
import type { CustomerMergeCaseState } from '@embroidery/database';

/** One participant, as an operator may see them. Masked contacts or nothing. */
export type MergeParticipantView = AdminCustomerSummary;

export interface CustomerMergeCaseView {
  readonly mergeCaseId: string;
  readonly status: CustomerMergeCaseState;
  /** Why the operator opened the case. Their own words, stored once. */
  readonly reason: string;
  readonly requestedByAdminId: string;
  readonly requestedAt: Date;
  /**
   * When the case left `REQUESTED`.
   *
   * The rejection metadata this read publishes. The operator's *rejection*
   * reason is not here: `customer_merge_cases` has one `reason` column and it
   * holds the open reason, so the declining reason is recorded in
   * `audit_events.reason` instead — see `CustomerMergeAuditRecorder`.
   */
  readonly decidedAt: Date | undefined;
  readonly survivor: MergeParticipantView | undefined;
  readonly loser: MergeParticipantView | undefined;
  readonly consequencePreview: MergeConsequencePreview;
}

@Injectable()
export class CustomerMergeCaseQuery {
  constructor(
    @Inject(CUSTOMER_MERGE_CASE_REPOSITORY)
    private readonly cases: CustomerMergeCaseRepository,
    @Inject(ADMIN_CUSTOMER_SUMMARY_PORT)
    private readonly summaries: AdminCustomerSummaryPort,
    private readonly preview: MergeConsequencePreviewReader,
  ) {}

  async detail(mergeCaseId: CustomerMergeCaseId): Promise<CustomerMergeCaseView> {
    const mergeCase = requireMergeCase(await this.cases.findById(mergeCaseId));

    const [survivor, loser, consequencePreview] = await Promise.all([
      this.summaries.findDetailSummary(mergeCase.survivorCustomerId),
      this.summaries.findDetailSummary(mergeCase.loserCustomerId),
      // Computed on every read, from current rows, and stored nowhere. Even for
      // a `REJECTED` or `EXECUTED` case: a stale number wearing the authority of
      // a record is worse than a current one that says nothing moved.
      this.preview.forLoser(mergeCase.loserCustomerId),
    ]);

    return {
      mergeCaseId: mergeCase.id,
      status: mergeCase.status,
      reason: mergeCase.reason,
      requestedByAdminId: mergeCase.requestedByAdminId,
      requestedAt: mergeCase.createdAt,
      decidedAt: mergeCase.decidedAt,
      survivor,
      loser,
      consequencePreview,
    };
  }
}

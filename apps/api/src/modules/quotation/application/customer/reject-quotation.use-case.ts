/**
 * `TR-LC12-06` — the customer declining the exact version they were shown
 * (`APP6-B05`).
 *
 * ### One transaction, and a much shorter one
 *
 * ```text
 * authorize the secure link      (before the transaction: policy, abuse budget, digest)
 * begin
 *   re-establish the grant under its row lock, and re-walk grant -> request ->
 *     quotation -> version, proving every containment            (ADR-DB3-004 r9)
 *   reject the version: SENT + still current, under FOR UPDATE,
 *     then REJECTED + the REJECTED header
 *   append the quotation.rejected audit row
 * commit
 * ```
 *
 * ### Rejecting a price is not rejecting the request
 *
 * The single most important thing this file does is what it does **not** do:
 * there is no `CUSTOM_REQUEST_REPOSITORY` in the constructor, so no code path
 * here can move the Custom Request at all. `APP6-B05` §13 states the rule and
 * `APP5-G01` supplies the reason — the request's `REJECTED` state is an **Admin
 * moderation outcome** from the pre-quotation review lifecycle, meaning "we will
 * not take this job". A customer declining a price means something else
 * entirely, and the request stays in the quotation stage where the workshop can
 * draft and send a revised version under the existing `APP6-B01`/`B03` rules.
 *
 * Projecting `REJECTED` here would also be unreachable-by-authority in the
 * literal sense: `TR-LC11-04`'s actor is the Admin, and LC-11 offers no
 * customer-commanded edge into it.
 *
 * ### No step-up
 *
 * `TR-LC12-06` lists GRD-002 alone (`APP6-G01` §8's table: *Reject quotation —
 * grant required, step-up no*). ADR-DB3-004 r4's sensitive set is about actions
 * that commit money or approve work; declining an offer commits nothing and
 * leaves every historical row exactly as it was. So `StepUpEvidenceResolver` is
 * not injected here, and a rejection cannot be made to require re-verification
 * by editing this file alone.
 *
 * ### No idempotency namespace
 *
 * `APP6-G01` §10 disposes of this explicitly: **natural**, because the version's
 * terminal state *is* the record. A second rejection of the same version finds
 * it no longer `SENT` and is refused as `INVALID_TRANSITION` — it does not
 * append a second row, a second audit event or a second header write, which is
 * the property a namespace would have bought. Creating `quotation.reject` for
 * symmetry with `quotation.accept` would add an `idempotency_records` row per
 * declined offer for no guarantee that is not already held.
 *
 * ### Nothing is re-priced, and nothing historical moves
 *
 * No amount is read, written, parsed or compared in this file. `reject` writes
 * `status` on the version and `status` on the header, and
 * `trg_quotation_versions__reject_mutation` would refuse anything else.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { quotationDecisionError } from '../../domain/decision/quotation-decision.errors';
import { QuotationDecisionRecorder } from './quotation-decision.recorder';
import { QuotationDecisionTargetResolver } from './quotation-decision.target';
import type { QuotationRejectedView } from './quotation-decision.view';

/** The whole input: one credential and the version the customer was looking at. */
export interface RejectQuotationCommand {
  readonly token: string;
  readonly versionId: QuotationVersionId;
}

/** The one persistence verdict this use case translates. */
const INVALID_TRANSITION = 'INVALID_TRANSITION';

@Injectable()
export class RejectQuotationUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly targets: QuotationDecisionTargetResolver,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    private readonly recorder: QuotationDecisionRecorder,
    private readonly clock: AuditClock,
  ) {}

  async reject(command: RejectQuotationCommand): Promise<QuotationRejectedView> {
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        // `APP6-G01` §10's code, and the same one a repeat rejection gets: a
        // version that is not the current offer is not one TR-LC12-06 starts
        // from. Rejection publishes no QUOTE_VERSION_STALE — GRD-006 does not
        // guard it, and inventing the code here would be a fourth refusal on a
        // surface whose whole vocabulary is two.
        const target = await this.targets.resolve(command, now, 'INVALID_TRANSITION');

        const rejected = await this.quotations.reject({
          versionId: target.version.id,
          rejectedAt: now,
        });

        await this.recorder.recordRejection({
          quotationId: target.quotation.id,
          versionId: rejected.id,
          version: rejected.version,
          customerId: target.grant.customerId,
          grantId: target.grant.id,
          decidedAt: now,
        });

        // Re-read rather than assumed: the header's status was written by
        // `reject`, and reporting what this code believes it wrote is how a
        // response starts disagreeing with the row.
        const committed = await this.quotations.findById(target.quotation.id);

        return {
          versionId: rejected.id,
          version: rejected.version,
          versionStatus: rejected.status,
          quotationStatus: committed?.status ?? target.quotation.status,
          rejectedAt: now,
        };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * Translates the one verdict this use case owns.
   *
   * `INVALID_TRANSITION` covers every state `TR-LC12-06` cannot start from —
   * already rejected, already accepted, superseded, expired, never sent, no
   * longer current — as `APP6-G01` §10 requires for the repeat case and as the
   * repository documents for the rest. Everything else travels as itself to the
   * platform filter, which sanitises it.
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === INVALID_TRANSITION) {
      return quotationDecisionError('INVALID_TRANSITION');
    }
    return error;
  }
}

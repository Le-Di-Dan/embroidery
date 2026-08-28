/**
 * Declines one `REQUESTED` merge case (`APP10-B02` §9).
 *
 * A lifecycle decision and nothing else. The case moves to `REJECTED`,
 * `decided_at` is stamped, and one audit row records who declined it and why.
 * No customer row is touched, no `merged_into_customer_id` written, no contact
 * moved, no grant revoked, no request, order or asset repointed and no
 * `customer_merge_events` row appended — this class holds no collaborator that
 * could do any of them.
 *
 * ### Not idempotent, deliberately
 *
 * A case that is already `REJECTED` or `EXECUTED` is a 409, not a quiet
 * success. `adminSecureGrant_revoke` set that precedent for this repository, and
 * merge has the stronger reason: a rejection carries a mandatory operator
 * reason, `customer_merge_cases` has no idempotency key, and the schema gives no
 * way to tell a retried request from a second operator deciding the same case.
 * Answering 204 would silently discard the second reason. `APP10-B01`'s
 * idempotent promote and deactivate are not a counter-example — neither takes an
 * operator payload, so a replay there genuinely describes a world that is
 * already the requested one.
 *
 * The guard is enforced twice on purpose, and the second one is the real one:
 * the policy refuses a non-`REQUESTED` case it has read, and the UPDATE carries
 * `status = 'REQUESTED'` in its own predicate, so a case decided between the
 * read and the write matches nothing and is refused rather than overwritten.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { CustomerMergeAuditRecorder } from './customer-merge-audit.recorder';
import { CustomerMergeError } from '../domain/merge/customer-merge.errors';
import { requireMergeCase, requireRejectableCase } from '../domain/merge/customer-merge.policy';
import {
  CUSTOMER_MERGE_CASE_REPOSITORY,
  type CustomerMergeCaseId,
  type CustomerMergeCaseRepository,
} from '../domain/repositories/customer-merge-case.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';

export interface RejectCustomerMergeCaseCommand {
  readonly mergeCaseId: CustomerMergeCaseId;
  /** Trimmed and length-bounded by the request schema before it arrives. */
  readonly rejectionReason: string;
}

@Injectable()
export class RejectCustomerMergeCase {
  constructor(
    @Inject(CUSTOMER_MERGE_CASE_REPOSITORY)
    private readonly cases: CustomerMergeCaseRepository,
    private readonly transactions: TransactionManager,
    private readonly clock: AuditClock,
    private readonly audit: CustomerMergeAuditRecorder,
  ) {}

  async reject(command: RejectCustomerMergeCaseCommand): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      const existing = requireRejectableCase(
        requireMergeCase(await this.cases.findById(command.mergeCaseId)),
      );

      // The decision instant is the audit clock's, so the row's `decided_at`
      // and its audit event carry the same moment rather than two `new Date()`
      // calls that differ by a query.
      const decided = await this.cases.reject(existing.id, this.clock.now());
      if (decided === undefined) {
        // The guarded UPDATE matched nothing: another request decided this case
        // between the read above and this write. Same refusal the policy gives.
        throw new CustomerMergeError('MERGE_CASE_NOT_REQUESTED');
      }

      await this.audit.recordRejected({
        mergeCaseId: decided.id,
        survivorCustomerId: decided.survivorCustomerId,
        loserCustomerId: decided.loserCustomerId,
        rejectionReason: command.rejectionReason,
      });
    });
  }
}

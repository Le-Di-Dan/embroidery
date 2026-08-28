/**
 * The one place a `customer_merge_cases` row becomes a domain merge case
 * (`APP10-B02`).
 *
 * Separate from the repository for the reason `customer-row.mapper.ts` is: the
 * NULL-to-`undefined` translation is a rule about the contract, not about a
 * statement, and stating it once means the three read paths cannot disagree
 * about what an undecided case looks like.
 */
import type {
  CustomerMergeCase,
  CustomerMergeCaseId,
} from '../../domain/repositories/customer-merge-case.repository';
import type { CustomerId } from '../../domain/repositories/customer.repository';
import type { CustomerMergeCaseState } from '@embroidery/database';

export interface MergeCaseRow {
  readonly id: string;
  readonly survivorCustomerId: string;
  readonly loserCustomerId: string;
  readonly status: string;
  readonly reason: string;
  readonly requestedByAdminId: string;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
}

export function toMergeCase(row: MergeCaseRow): CustomerMergeCase {
  return {
    id: row.id as CustomerMergeCaseId,
    survivorCustomerId: row.survivorCustomerId as CustomerId,
    loserCustomerId: row.loserCustomerId as CustomerId,
    // `ck_customer_merge_cases__status_allowed` is the arbiter of this column's
    // value set, so the cast restates a constraint rather than trusting a
    // string: a row can hold nothing outside `CUSTOMER_MERGE_CASE_STATES`.
    status: row.status as CustomerMergeCaseState,
    reason: row.reason,
    requestedByAdminId: row.requestedByAdminId,
    decidedAt: row.decidedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

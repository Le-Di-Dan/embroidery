/**
 * TBL-009 `customer_merge_cases` persistence contract (`APP10-B02`).
 *
 * The **lifecycle half** of merge, and only that half. There is no `execute`,
 * no method that touches `customers.merged_into_customer_id`, no method that
 * appends a `customer_merge_events` row, and no method that takes the two
 * customer rows under a lock. All four belong to `APP10-B03`, the checkpoint
 * that owns the single transaction which performs a merge (`APP10-G01` §E.2).
 *
 * A separate contract from {@link CustomerRepository} rather than four more
 * methods on it, on the rule `admin-customer-summary.port.ts` records: a merge
 * case is a workflow row about two customers, not a property of one, and the
 * customer contract's rows carry the raw contact values a merge surface must
 * never hold.
 *
 * ### `REQUESTED` and `REJECTED`, and no third state here
 *
 * `CUSTOMER_MERGE_CASE_STATES` is the canonical vocabulary and B02 does not
 * widen it. `EXECUTED` is reachable only from B03, so nothing in this contract
 * writes it — but {@link CustomerMergeCase.status} publishes it, because a case
 * B03 executed must still be readable and must still refuse a rejection.
 *
 * There is deliberately no "previewed", "approved" or "confirmed" state: a
 * consequence preview is derived from current rows every time it is asked for
 * (`APP10-B02` §8.3), so persisting that it happened would record a page view
 * as a workflow step.
 */
import type { CustomerMergeCaseState } from '@embroidery/database';

import type { CustomerId } from './customer.repository';

export type CustomerMergeCaseId = string & { readonly __brand: 'CustomerMergeCaseId' };

export interface CustomerMergeCase {
  readonly id: CustomerMergeCaseId;
  /** The identity that survives. Chosen by the operator, never inferred. */
  readonly survivorCustomerId: CustomerId;
  /** The identity that would be tombstoned by `APP10-B03`. */
  readonly loserCustomerId: CustomerId;
  readonly status: CustomerMergeCaseState;
  /** Why the operator believes these two are one person. Required at open. */
  readonly reason: string;
  /**
   * The Admin who opened the case, from the bound session actor.
   *
   * `requested_by_admin_id` carries no foreign key by DB4's REL-105
   * evidence-class precedent, so this is an identifier and not a join.
   */
  readonly requestedByAdminId: string;
  /** When the case left `REQUESTED`. Absent while it is still open. */
  readonly decidedAt: Date | undefined;
  readonly createdAt: Date;
}

export interface OpenCustomerMergeCaseInput {
  readonly id: CustomerMergeCaseId;
  readonly survivorCustomerId: CustomerId;
  readonly loserCustomerId: CustomerId;
  readonly reason: string;
  readonly requestedByAdminId: string;
}

export const CUSTOMER_MERGE_CASE_REPOSITORY = Symbol('CUSTOMER_MERGE_CASE_REPOSITORY');

export interface CustomerMergeCaseRepository {
  /**
   * Inserts one `REQUESTED` case.
   *
   * The CST-010 partial unique (`uq_customer_merge_cases__survivor_loser__requested`)
   * is the arbiter of "one open case per pair", not a check the caller makes
   * first: two operators opening the same pair at the same instant both pass any
   * pre-read, and only the index can reject the second. The rejection arrives as
   * a `PersistenceError` carrying the catalogued `MERGE_CASE_ALREADY_OPEN` code,
   * which the use case maps to the same refusal its pre-check gives.
   *
   * @requiresTransaction — the audit row must commit with the case, or neither.
   */
  open(input: OpenCustomerMergeCaseInput): Promise<CustomerMergeCase>;

  findById(id: CustomerMergeCaseId): Promise<CustomerMergeCase | undefined>;

  /**
   * The open case for one **ordered** pair, if there is one.
   *
   * Ordered, because survivor and loser are not interchangeable: CST-010 is on
   * `(survivor_customer_id, loser_customer_id)`, so `(A→B)` and `(B→A)` are
   * different pairs to the index and this method answers about exactly the pair
   * it is asked. It is a courtesy read that turns a race into a clean refusal
   * for the common, non-concurrent case; it is never the guarantee.
   */
  findOpenForPair(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<CustomerMergeCase | undefined>;

  /**
   * Moves one `REQUESTED` case to `REJECTED`, stamping `decided_at`.
   *
   * The `status = 'REQUESTED'` predicate is in the statement, so a case another
   * request rejected or executed in between matches nothing and this returns
   * `undefined` — the caller reports a transition conflict rather than
   * overwriting a decision that was already made. No customer row, contact,
   * grant, request, order or asset is touched: a rejection is a decision about
   * the case and nothing else.
   *
   * @requiresTransaction — the audit row must commit with the transition.
   */
  reject(id: CustomerMergeCaseId, decidedAt: Date): Promise<CustomerMergeCase | undefined>;
}

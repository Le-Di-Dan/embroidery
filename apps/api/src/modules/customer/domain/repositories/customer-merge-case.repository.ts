/**
 * TBL-009 `customer_merge_cases` persistence contract (`APP10-B02`).
 *
 * The **case lifecycle**, and only that. This contract opens a case, reads one,
 * and moves it out of `REQUESTED`; it never touches
 * `customers.merged_into_customer_id`, never moves a contact, a grant, a
 * request, an order or an asset, and never appends a `customer_merge_events`
 * row. `APP10-B03` owns the transaction that performs a merge, through ports of
 * its own (`customer-merge-execution.port.ts`,
 * `customer-merge-event.repository.ts`); what it adds *here* is the two methods
 * a case transition needs and nothing else — {@link CustomerMergeCaseRepository.lockById}
 * and {@link CustomerMergeCaseRepository.execute}.
 *
 * A separate contract from {@link CustomerRepository} rather than four more
 * methods on it, on the rule `admin-customer-summary.port.ts` records: a merge
 * case is a workflow row about two customers, not a property of one, and the
 * customer contract's rows carry the raw contact values a merge surface must
 * never hold.
 *
 * ### `REQUESTED` and `REJECTED`, and no third state here
 *
 * `CUSTOMER_MERGE_CASE_STATES` is the canonical vocabulary and neither B02 nor
 * B03 widens it. Both terminal transitions are guarded in their own statement's
 * predicate rather than by a read the caller made first, so a case decided
 * between a read and a write matches nothing and is refused instead of
 * overwritten.
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
   * The same read, taken under the case row's `FOR UPDATE` lock
   * (`APP10-B03` §8).
   *
   * The serialization point of merge execution. Two execute requests for one
   * case both reach this statement; the second blocks until the first commits
   * and then reads `EXECUTED`, which is an idempotent success that performs no
   * work — so the destructive half runs once even though two callers asked for
   * it. A plain re-read would let both see `REQUESTED` and race into the same
   * transfers, with only the guarded UPDATE below to arbitrate, after the
   * ownership had already moved twice.
   *
   * It is also the *first* lock the execution transaction takes, before either
   * customer row. Two executes of the same case therefore queue on the case
   * rather than on a customer, and two executes of different cases sharing a
   * customer are serialized by the ordered customer locks (CC-27) instead.
   *
   * @requiresTransaction — a lock taken outside one is released immediately and
   * proves nothing.
   */
  lockById(id: CustomerMergeCaseId): Promise<CustomerMergeCase | undefined>;

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

  /**
   * Moves one `REQUESTED` case to `EXECUTED`, stamping `decided_at`
   * (`APP10-B03` §17).
   *
   * The same guarded shape {@link reject} uses, and for the same reason:
   * `status = 'REQUESTED'` is in the statement, so a case rejected or executed
   * in between matches nothing and this returns `undefined`. It is the last
   * write of the merge transaction — the case becomes `EXECUTED` only in the
   * transaction that actually performed the merge, so a rollback leaves it
   * `REQUESTED` and the operator may retry.
   *
   * The open `reason` is never touched: it records why the case was raised, and
   * executing it does not change that.
   *
   * @requiresTransaction — the transition, the transfers, the merge events and
   * the audit row commit together or not at all.
   */
  execute(id: CustomerMergeCaseId, decidedAt: Date): Promise<CustomerMergeCase | undefined>;
}

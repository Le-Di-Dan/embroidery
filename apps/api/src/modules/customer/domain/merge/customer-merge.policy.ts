/**
 * When a merge case may be opened or rejected, as pure decisions
 * (`APP10-B02` §6.2, §9.2).
 *
 * Every eligibility rule B02 enforces is here, decided from rows already loaded
 * and either returning or throwing a {@link CustomerMergeError}. Nothing in this
 * file opens a transaction, calls a repository or reaches a clock, so each rule
 * reads — and tests — as the sentence it is.
 *
 * The rules that are **not** here are the ones the database owns: one open case
 * per ordered pair (CST-010, a partial unique) and survivor ≠ loser (CST-069's
 * second instance, a CHECK). Those are arbiters, not checks; re-deciding them
 * here would replace a constraint that cannot be raced with a read that can.
 * Self-merge is refused a step earlier still, by the request schema, so it never
 * costs a database round trip — see `admin-customer-merge.request.ts`.
 *
 * ### Nothing is inferred, swapped or followed
 *
 * There is no rule below that picks a survivor, reverses the operator's choice,
 * or walks `merged_into_customer_id` to find the identity a tombstone resolves
 * to. A merge is the deliberate, audited join of two identities an operator has
 * already decided belong together (ADR-DB2-001 r5); a system that quietly
 * corrected which one survives would be making that decision instead of them.
 */
import type { Customer } from '../repositories/customer.repository';
import type { CustomerMergeCase } from '../repositories/customer-merge-case.repository';
import { CustomerMergeError } from './customer-merge.errors';

/**
 * The identity that will survive, proven to exist and to be a live identity.
 *
 * Absent is a 404 and tombstoned is a 409. The second matters most: a customer
 * carrying `merged_into_customer_id` is the losing half of a completed merge,
 * kept so history resolves. Merging into it would create a survivor that
 * nothing reads.
 */
export function requireEligibleSurvivor(customer: Customer | undefined): Customer {
  if (customer === undefined) {
    throw new CustomerMergeError('SURVIVOR_NOT_FOUND');
  }
  if (customer.mergedIntoCustomerId !== undefined) {
    throw new CustomerMergeError('SURVIVOR_ALREADY_MERGED');
  }
  return customer;
}

/**
 * The identity that would be tombstoned, proven to exist and not already be one.
 *
 * A loser that already carries `merged_into_customer_id` has had its live
 * references moved once already: opening a second case would promise to move
 * rows that are no longer there, and the preview would honestly report zero
 * while the operator believed something was pending.
 */
export function requireEligibleLoser(customer: Customer | undefined): Customer {
  if (customer === undefined) {
    throw new CustomerMergeError('LOSER_NOT_FOUND');
  }
  if (customer.mergedIntoCustomerId !== undefined) {
    throw new CustomerMergeError('LOSER_ALREADY_MERGED');
  }
  return customer;
}

/**
 * Refuses a second open case for the same ordered pair.
 *
 * A courtesy read, not the guarantee. Two operators opening the same pair in the
 * same instant both pass this, and CST-010's partial unique is what stops the
 * second INSERT. Both paths raise the same failure, so a caller cannot tell
 * whether it lost a race or asked for something that was already true — which is
 * the point: the answer is the same either way.
 */
export function requireNoOpenCase(existing: CustomerMergeCase | undefined): void {
  if (existing !== undefined) {
    throw new CustomerMergeError('MERGE_CASE_ALREADY_OPEN');
  }
}

/** The case addressed by the path, proven to exist. */
export function requireMergeCase(mergeCase: CustomerMergeCase | undefined): CustomerMergeCase {
  if (mergeCase === undefined) {
    throw new CustomerMergeError('MERGE_CASE_NOT_FOUND');
  }
  return mergeCase;
}

/**
 * The case a rejection may decide.
 *
 * Only `REQUESTED`. An already-`REJECTED` case is a conflict rather than an
 * idempotent success, and an `EXECUTED` one is a conflict for a stronger reason
 * still — its merge has happened, and answering anything but a refusal would
 * suggest a decision could be taken back.
 */
export function requireRejectableCase(mergeCase: CustomerMergeCase): CustomerMergeCase {
  if (mergeCase.status !== 'REQUESTED') {
    throw new CustomerMergeError('MERGE_CASE_NOT_REQUESTED');
  }
  return mergeCase;
}

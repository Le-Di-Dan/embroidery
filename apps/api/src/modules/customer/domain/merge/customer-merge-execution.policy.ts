/**
 * When a merge case may be *executed*, and how the two collisions execution can
 * meet are resolved (`APP10-B03` §6, §9, §10, §11).
 *
 * Pure decisions over rows the caller has already read **inside the execution
 * transaction**. Nothing here opens a transaction, reads a repository, reaches a
 * clock or writes: each rule is the sentence it enforces, so the transaction
 * that performs a merge reads as an ordered list of decisions rather than as a
 * pile of conditions.
 *
 * The rules the *database* owns are deliberately not restated: survivor ≠ loser
 * is `ck_customer_merge_cases__no_self_merge` on the case row itself, one
 * primary contact per customer is CST-006, and one business profile per customer
 * is CST-051. Those are arbiters. What is here is the policy that decides what
 * to do *before* reaching them — because reaching a unique violation mid-merge
 * aborts the transaction, and an operator deserves a bounded answer rather than
 * a rolled-back surprise.
 */
import type { ContactPointId, Customer, CustomerId } from '../repositories/customer.repository';
import type { CustomerMergeCase } from '../repositories/customer-merge-case.repository';
import { CustomerMergeError } from './customer-merge.errors';
import { requireEligibleLoser, requireEligibleSurvivor } from './customer-merge.policy';

/**
 * The reason every grant a merge revokes carries (DB3 §4 step 4).
 *
 * One canonical string, stated once. `ck_secure_access_grants__revoke_reason_required`
 * makes a reason mandatory on any revoked row, and the operator's *case* reason
 * deliberately does not travel here: it is free text about two identities, and a
 * grant's revoke reason is read back on a support screen beside links belonging
 * to other people. What matters at that screen is why the link stopped working,
 * and the answer is that the customer was merged.
 */
export const MERGE_GRANT_REVOKE_REASON = 'merge';

/**
 * What an execute request should do with the case it addressed.
 *
 * Two values, and the second is the whole idempotency contract: a case that is
 * already `EXECUTED` is answered with a success that performs **no** work, not
 * with a conflict. Merge execution takes no operator payload — the case is the
 * authority for survivor, loser and reason — so a replay genuinely describes the
 * world that already exists. That is the opposite of a rejection, which carries
 * a reason a second caller typed and therefore refuses rather than discards it.
 */
export type MergeExecutionDisposition = 'EXECUTE' | 'ALREADY_EXECUTED';

/**
 * Whether the two business profiles can survive one merge (`APP10-B03` §10).
 *
 * Three facts rather than one boolean, because the operator needs to see the
 * blocker *before* confirming: which side has a profile decides whether anything
 * moves, and the pair of them decides whether execution is possible at all. The
 * merge consequence preview publishes exactly this shape.
 */
export interface BusinessProfileReadiness {
  readonly loserHasProfile: boolean;
  readonly survivorHasProfile: boolean;
  /** Both sides hold one. Execution refuses before any destructive write. */
  readonly conflict: boolean;
}

/** Derives the readiness verdict from the two presence facts. Stated once. */
export function businessProfileReadiness(
  loserHasProfile: boolean,
  survivorHasProfile: boolean,
): BusinessProfileReadiness {
  return {
    loserHasProfile,
    survivorHasProfile,
    conflict: loserHasProfile && survivorHasProfile,
  };
}

/**
 * The disposition of the case an execute request addressed.
 *
 * `REQUESTED` executes, `EXECUTED` replays, and everything else — which today is
 * only `REJECTED` — is refused. The refusal is deliberately checked **before**
 * participant eligibility: a retry of an executed case must not fail merely
 * because its loser is now a tombstone, and re-running eligibility first would
 * make it do exactly that.
 */
export function classifyExecutableCase(mergeCase: CustomerMergeCase): MergeExecutionDisposition {
  if (mergeCase.status === 'EXECUTED') {
    return 'ALREADY_EXECUTED';
  }
  if (mergeCase.status !== 'REQUESTED') {
    throw new CustomerMergeError('MERGE_CASE_NOT_EXECUTABLE');
  }
  return 'EXECUTE';
}

export interface MergeParticipants {
  readonly survivor: Customer;
  readonly loser: Customer;
}

/**
 * Both participants, re-proven live inside the execution transaction.
 *
 * The B02 preview is advisory and the case may have been open for days: a
 * participant merged away by another case in the meantime must stop this one.
 * The same two rules the open path uses, reused rather than restated, so
 * "already merged" cannot come to mean two different things in one feature.
 */
export function requireLiveParticipants(
  survivor: Customer | undefined,
  loser: Customer | undefined,
): MergeParticipants {
  return {
    survivor: requireEligibleSurvivor(survivor),
    loser: requireEligibleLoser(loser),
  };
}

/** Refuses a merge that would need two business profiles to become one row. */
export function requireTransferableBusinessProfile(readiness: BusinessProfileReadiness): void {
  if (readiness.conflict) {
    throw new CustomerMergeError('MERGE_BUSINESS_PROFILE_CONFLICT');
  }
}

/** One contact row, reduced to what the primary-uniqueness rule needs. */
export interface MergeContactRow {
  readonly id: ContactPointId;
  readonly customerId: CustomerId;
  readonly isPrimary: boolean;
}

/**
 * Which loser contacts must lose their primary flag before the move
 * (`APP10-B03` §11.2).
 *
 * CST-006 is a partial unique on `customer_id WHERE is_primary`, so a survivor
 * that already carries a primary cannot receive a second one. The precedence is
 * fixed and one-directional: **the survivor's existing primary wins.** The
 * operator chose which identity survives, and silently promoting the merged-away
 * customer's contact over it would change how that person is contacted as a side
 * effect of a merge nobody asked to do that.
 *
 * When the survivor has no primary at all, the loser's stays primary and simply
 * moves — the merged customer then has one, which is the state the schema wants
 * and the state it would have had anyway.
 *
 * Only `is_primary` is ever touched, and only on the loser's side. No
 * `verified_at`, no `verified_source`, no value and no `deactivated_at`: a
 * demoted contact keeps every piece of evidence it arrived with.
 *
 * Deterministic under a loser that somehow holds more than one primary (which
 * CST-006 forbids): the rows are ordered by id and the first survives.
 */
export function planPrimaryContactDemotions(
  contacts: readonly MergeContactRow[],
  survivorCustomerId: CustomerId,
  loserCustomerId: CustomerId,
): readonly ContactPointId[] {
  const survivorHasPrimary = contacts.some(
    (contact) => contact.customerId === survivorCustomerId && contact.isPrimary,
  );
  const loserPrimaries = contacts
    .filter((contact) => contact.customerId === loserCustomerId && contact.isPrimary)
    .map((contact) => contact.id)
    .sort();

  return survivorHasPrimary ? loserPrimaries : loserPrimaries.slice(1);
}

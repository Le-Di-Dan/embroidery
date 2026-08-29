/**
 * CTX-CUS's own half of merge **execution** (`APP10-B03` §7, §8, §11, §15).
 *
 * The destructive counterpart of `customer-merge-preview.port.ts`. Where that
 * port counts and never writes, every method here either takes a lock or moves
 * ownership, and each one is `@requiresTransaction`: a merge is one transaction
 * or it is a half-merged customer.
 *
 * ### A port of its own, not four more methods on `CustomerRepository`
 *
 * On the rule `admin-customer-summary.port.ts` records. `CustomerRepository` is
 * the identity aggregate's contract — create from a verified contact, verify,
 * promote, deactivate, anonymize — and its rows carry `normalizedValue` and
 * `displayValue`. Merge execution needs none of those values and must not hold
 * them: it moves rows by customer id and never looks at what a contact says.
 * Keeping the two apart also keeps the tombstone write in one place: nothing on
 * `CustomerRepository` can set `merged_into_customer_id`, and nothing here can
 * mint a verified contact.
 *
 * ### The locks are the deadlock discipline, and they are ordered
 *
 * CC-27 / D8-18: two customer rows locked in a deterministic order that does not
 * depend on which one the operator chose as survivor. Two merges touching the
 * same pair from opposite directions therefore queue instead of deadlocking. The
 * order is by primary key, decided inside the statement, so no caller can get it
 * wrong by passing its arguments the other way round.
 */
import type { ContactPointId, Customer, CustomerId } from './customer.repository';

export const CUSTOMER_MERGE_EXECUTION_PORT = Symbol('CUSTOMER_MERGE_EXECUTION_PORT');

/** Both participants as they are *now*, under `FOR UPDATE`. Absent means gone. */
export interface LockedMergeParticipants {
  readonly survivor: Customer | undefined;
  readonly loser: Customer | undefined;
}

/**
 * One locked contact row, reduced to the three facts the move needs.
 *
 * No value, no verification instant, no source. The primary-uniqueness plan is
 * decided from ownership and a flag; loading the addresses to move rows by id
 * would put both customers' contacts in memory on the one path that has no use
 * for them.
 */
export interface LockedContactPoint {
  readonly id: ContactPointId;
  readonly customerId: CustomerId;
  readonly isPrimary: boolean;
}

export interface CustomerMergeExecutionPort {
  /**
   * Locks both customer rows in **primary-key order** and returns them.
   *
   * The ordering is the whole point (CC-27): `FOR UPDATE` on a set sorted by id
   * makes every merge in the system take the same two rows in the same sequence,
   * so a pair being merged A→B and B→A at the same instant serializes rather
   * than deadlocking. Survivor and loser keep their product meaning; only the
   * lock sequence is normalized.
   *
   * A missing row comes back absent rather than throwing: which participant
   * disappeared decides which refusal the caller gives.
   *
   * @requiresTransaction — a lock taken outside one is released immediately and
   * proves nothing.
   */
  lockParticipants(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<LockedMergeParticipants>;

  /**
   * Locks every contact row of both customers, ordered by id.
   *
   * Both sides, because the primary rule is about the pair: whether the loser's
   * primary may stay primary depends on whether the survivor already has one.
   * Locking them also closes the window against `APP10-B01`'s promote and
   * deactivate, whose updates block on these rows until the merge commits.
   *
   * @requiresTransaction
   */
  lockContactPoints(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<LockedContactPoint[]>;

  /**
   * Clears `is_primary` on the named contacts, and touches nothing else.
   *
   * The narrowest write in this contract: no value, no verification field and no
   * `deactivated_at` is reachable through it, so a demotion cannot become a
   * rewrite of the evidence a contact carries.
   *
   * @requiresTransaction
   */
  demotePrimaryContacts(contactPointIds: readonly ContactPointId[]): Promise<void>;

  /**
   * Repoints every contact row of the loser to the survivor, returning how many
   * moved.
   *
   * Every row, deactivated and unverified included: each carries `customer_id`
   * under a `RESTRICT` foreign key, so one left behind would attach a live
   * reference to a tombstone. Nothing but `customer_id` changes — the value, the
   * verification instant and the verification source travel with the row,
   * because they are the proof the contact was verified and a merge does not
   * re-earn it.
   *
   * @requiresTransaction
   */
  moveContactPoints(loserCustomerId: CustomerId, survivorCustomerId: CustomerId): Promise<number>;

  /**
   * Locks both customers' `business_profiles` rows and reports which sides have
   * one.
   *
   * Read under `FOR UPDATE` inside the transaction rather than trusted from the
   * preview: CST-051 allows one profile per customer, and a profile created for
   * the survivor after the preview was drawn is exactly the case that must fail
   * closed instead of colliding halfway through the merge.
   *
   * @requiresTransaction
   */
  lockBusinessProfileOwnership(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<{ readonly survivorHasProfile: boolean; readonly loserHasProfile: boolean }>;

  /**
   * Repoints the loser's business profile to the survivor, returning how many
   * rows moved — `0` when the loser has none.
   *
   * Only ever called when the survivor has none. The caller proves that first;
   * `uq_business_profiles__customer` is the arbiter that makes the mistake
   * impossible rather than merely unlikely.
   *
   * @requiresTransaction
   */
  moveBusinessProfile(loserCustomerId: CustomerId, survivorCustomerId: CustomerId): Promise<number>;

  /**
   * Writes the tombstone: `loser.merged_into_customer_id = survivor.id`
   * (`APP10-B03` §15).
   *
   * The loser row is **kept**. It is not deleted, not anonymized and not
   * emptied: it stays the historical identity every frozen snapshot, acceptance
   * and transition row still points at, and the pointer is what new activity
   * resolves forward through.
   *
   * Guarded on `merged_into_customer_id IS NULL`, so a customer tombstoned by
   * another transaction in the meantime matches nothing and this answers
   * `false` — the caller refuses rather than overwriting which merge claimed it.
   *
   * @requiresTransaction — the tombstone is the last step, and it belongs to the
   * transfers before it.
   */
  tombstone(loserCustomerId: CustomerId, survivorCustomerId: CustomerId): Promise<boolean>;
}

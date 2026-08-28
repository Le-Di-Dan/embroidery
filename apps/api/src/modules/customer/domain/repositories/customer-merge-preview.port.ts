/**
 * Customer's own half of the merge consequence preview (`APP10-B02` §8).
 *
 * The three live identity references CTX-CUS owns:
 * `customer_contact_points`, `secure_access_grants` and `business_profiles`.
 * They are counted through a port of their own rather than through
 * {@link CustomerRepository} for the reason `admin-customer-summary.port.ts`
 * records: that contract returns `ContactPoint` rows carrying
 * `normalizedValue` and `displayValue` — the real address and the real number —
 * and a preview that loaded them to call `.length` would put every contact of
 * both customers one `.map` from an Admin response. This interface holds
 * numbers, so there is nothing on it to unmask.
 *
 * ### Read-only, and no transfer
 *
 * No method writes, opens a transaction or takes a lock. `APP10-B02` is the
 * non-destructive half of merge; the contact move, the grant revocation and the
 * tombstone are `APP10-B03`'s, inside its one transaction.
 */
export const CUSTOMER_MERGE_PREVIEW_PORT = Symbol('CUSTOMER_MERGE_PREVIEW_PORT');

/**
 * What a merge would carry out of CTX-CUS for one customer.
 *
 * **`contactPoints` counts every row, including deactivated ones.** A retired
 * contact still carries `customer_id` under a `RESTRICT` foreign key, so leaving
 * it behind would attach it to a tombstone; `CONTACT_MOVE` has to take all of
 * them. This is deliberately a different rule from the support detail read,
 * which lists current contacts only — that read answers "how can we reach this
 * person", and this count answers "how many rows move".
 *
 * **`activeSecureAccessGrants` counts `ACTIVE` only.** `DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md`
 * §4 step 4 revokes the loser's *active* grants with reason `merge`; an already
 * `EXPIRED` or `REVOKED` grant opens nothing and execution leaves it alone.
 * Counting them would tell an operator that access is being withdrawn when it
 * was withdrawn already.
 *
 * **`businessProfile` is a boolean.** `uq_business_profiles__customer` (CST-051)
 * makes it one row per customer at most, so a count could only ever be 0 or 1
 * and a number would invite a reader to expect otherwise.
 */
export interface CustomerOwnedReferenceCounts {
  readonly contactPoints: number;
  readonly activeSecureAccessGrants: number;
  readonly businessProfile: boolean;
}

export interface CustomerMergePreviewPort {
  countOwnedReferences(customerId: string): Promise<CustomerOwnedReferenceCounts>;
}

/**
 * Customer evidence for the Admin request surface (`APP5-B04` §9.2, §12).
 *
 * A **port**, on the rule `catalog-subject.port.ts` records: Ordering must not
 * read Customer's tables or call its concrete repositories
 * (`BACKEND_CONVENTIONS.md` §10). Ordering depends on this interface; Customer
 * implements it.
 *
 * ### Why not `CUSTOMER_REPOSITORY`, which is already exported
 *
 * Because of what that contract returns. `ContactPoint` carries
 * `normalizedValue` and `displayValue` — the real address and the real phone
 * number — and `Customer` carries the merge pointer and the anonymization stamp.
 * Handing Ordering that repository would put the raw contact of every customer
 * one `.map` away from an Admin response, with masking left to a projection
 * somebody could forget. Here the mask is applied inside Customer, by the
 * adapter, and {@link AdminCustomerContactSummary} has nowhere to put an
 * unmasked value — the same construction `APP4-B07` uses for its own screens.
 *
 * ### Why not `AdminCustomerSupportQuery`
 *
 * That class is `CustomerAdminSupportModule`'s use case for the *support*
 * screens, and importing it would make Ordering a second consumer of a class
 * that answers a different question one customer at a time. The queue needs a
 * page of customers in one statement, so this port is batch-first.
 *
 * ### It reads, and only reads
 *
 * No method opens a transaction, writes an audit event or touches a lifecycle,
 * and none returns a credential: no verification challenge, no grant, no token,
 * no digest, no session and no password material has a field here.
 */
import type { ContactKind } from '@embroidery/database';

/** One current contact, masked by `APP4-P01` before it leaves Customer. */
export interface AdminCustomerContactSummary {
  readonly kind: ContactKind;
  /** The deterministic mask. Never the normalized or display value. */
  readonly maskedValue: string;
  readonly verified: boolean;
  readonly primary: boolean;
}

/**
 * What an operator is shown about the person behind a request.
 *
 * `contacts` is empty on the queue projection and populated on the detail one —
 * a triage list does not need every address, and loading them for a page would
 * be a second query answering a question the list does not ask.
 */
export interface AdminCustomerSummary {
  readonly customerId: string;
  readonly displayName: string | undefined;
  readonly verifiedAt: Date;
  readonly contacts: readonly AdminCustomerContactSummary[];
}

export const ADMIN_CUSTOMER_SUMMARY_PORT = Symbol('ADMIN_CUSTOMER_SUMMARY_PORT');

export interface AdminCustomerSummaryPort {
  /**
   * A page of customers in one statement, without their contacts.
   *
   * Ids with no live customer row are simply absent from the map; the caller
   * renders the row without a name rather than dropping the request, because a
   * request whose customer cannot be described is still a request an operator
   * has to triage.
   */
  findQueueSummaries(
    customerIds: readonly string[],
  ): Promise<ReadonlyMap<string, AdminCustomerSummary>>;

  /** One customer with their current, masked contacts, for the detail read. */
  findDetailSummary(customerId: string): Promise<AdminCustomerSummary | undefined>;

  /**
   * The queue's contact filter: one exact contact to one customer id.
   *
   * Delegates to the canonical normalizers and the `(kind, normalized_value)`
   * uniqueness arbiter, exactly as `AdminCustomerSupportQuery.resolveByContact`
   * does, so an operator and a customer typing the same address reach the same
   * row. There is no partial, prefix, fuzzy or multi-result form — `APP4-B07`
   * refuses to publish a contact search, and `APP5-B04` §8 requires the existing
   * capability to be reused rather than a new one invented.
   *
   * `undefined` for unknown, unverified, deactivated and malformed alike.
   */
  resolveByExactContact(kind: ContactKind, rawContact: string): Promise<string | undefined>;
}

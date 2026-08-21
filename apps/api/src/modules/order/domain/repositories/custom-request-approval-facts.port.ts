/**
 * The request-owned facts an Approval Snapshot must freeze (`APP6-B11` §11).
 *
 * A **sixth** read-only Ordering contract beside {@link CustomRequestRepository}
 * (the AGG-13 write side), `CustomRequestStatusRepository`,
 * `CustomRequestQuotationPointerPort`, `CustomRequestDesignSourcePort` and
 * `CustomRequestDesignContextPort`, on the rule `APP6-B04` recorded and every
 * one of the five follows: what a module can inject is what its route can
 * eventually do. `CUSTOM_REQUEST_REPOSITORY` carries `submit`,
 * `replaceBreakdown`, `transition` and `setCurrentQuotation`; the approval
 * transaction does hold it — `TR-LC11-09` goes through it — but nothing else on
 * that port may be reachable from the *evidence* resolution, and a resolver that
 * had to take the write repository to read a quantity would be one call away
 * from rewriting the breakdown it is freezing.
 *
 * It is a separate contract rather than a widening of
 * {@link CustomRequestDesignContextPort} because the two answer different
 * questions at different moments. That one answers *"may a version be authored,
 * and on which branch"* and is read under the request's row lock at the top of
 * every design write. This one answers *"what does the customer's approval
 * freeze about their request"* — two facts that exist only to be copied into
 * `approval_snapshots` and never to authorize anything. Merging them would put a
 * COP display name and a quantity into the authorization read every design
 * write performs, for the one transaction in the phase that needs them.
 *
 * ### Why exactly these two facts
 *
 * `approval_snapshots.quantity_total` is `NOT NULL` and
 * `ck_approval_snapshots__quantity_positive` requires it to be positive, and
 * `product_name` is `NOT NULL` on both placement branches. On the Catalog branch
 * the name is Catalog's (`CATALOG_SUBJECT_PORT`); on the COP branch the only
 * truthful source is `customer_owned_products.name`, the customer's own words
 * for their own garment (ADR-APP6-001 §3.7). Nothing else about the request is
 * projected: no `code`, no `customer_id`, no note, no moderation reason, no
 * pointer and no timestamp — the SELECT that never retrieves a column is
 * redaction no downstream projection can forget.
 *
 * `AGG-13` ownership does not move: the contract is Ordering's, and it is
 * implemented against Ordering's own tables (TBL-038, TBL-039).
 */
import type { CustomRequestId } from './custom-request.repository';

export const CUSTOM_REQUEST_APPROVAL_FACTS_PORT = Symbol('CUSTOM_REQUEST_APPROVAL_FACTS_PORT');

/** What one request contributes to the immutable approval evidence. */
export interface CustomRequestApprovalFacts {
  /**
   * The sum of TBL-039's quantity lines for this request.
   *
   * Summed in SQL rather than by loading the lines and adding them here: the
   * snapshot freezes a total, the lines are a value object with no identity a
   * snapshot could reference, and pulling every line through the approval
   * transaction to add four integers is retrieval this port exists to avoid.
   *
   * `0` when the request has no lines at all, which is a refusal upstream and
   * never a snapshot: `ck_approval_snapshots__quantity_positive` would reject
   * the row, and inventing `1` to satisfy it would freeze a quantity nobody
   * ordered.
   */
  readonly quantityTotal: number;
  /**
   * `customer_owned_products.name`, or `undefined` on the Catalog branch.
   *
   * Optional because the branch decides it (CST-027, at most one COP row per
   * request). Absence is the Catalog branch, never a missing row.
   */
  readonly customerOwnedProductName: string | undefined;
}

export interface CustomRequestApprovalFactsPort {
  /**
   * The approval facts of one request, or nothing when the request row is
   * absent.
   *
   * Unlocked. The approval transaction already holds this row's `FOR UPDATE`
   * through `CustomRequestDesignContextPort.lockDesignContext` by the time this
   * is called, so a second `FOR UPDATE` would be a no-op that reads as a second
   * authority; and the quantity lines are app-frozen from `QUOTED` onward, which
   * every approvable request is well past.
   */
  findApprovalFacts(id: CustomRequestId): Promise<CustomRequestApprovalFacts | undefined>;
}

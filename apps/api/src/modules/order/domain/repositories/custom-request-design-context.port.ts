/**
 * The facts a formal Design Version needs from the request it is authored for
 * (`APP6-B08` §4, §5, §8).
 *
 * A **fifth** read-only Ordering contract beside {@link CustomRequestRepository}
 * (the AGG-13 write side), `CustomRequestStatusRepository`,
 * `CustomRequestQuotationPointerPort` and `APP6-B07`'s
 * `CustomRequestDesignSourcePort`, on exactly the reasoning `APP6-B04` recorded
 * for the third: what a module can inject is what its route can eventually do.
 * `CUSTOM_REQUEST_REPOSITORY` carries `submit`, `transition`, `lockById` and
 * `setCurrentQuotation`; an authoring surface that held it would be one
 * injection away from projecting `TR-LC11-08` itself, which is `APP6-B09`'s
 * transition and not this checkpoint's. There is no write on this port to reach.
 *
 * It is a separate contract rather than a widening of the B07 pointer for the
 * same reason that one is separate from the quotation pointer: B07 answers *"what
 * did the customer design from"* and deliberately carries no status and no
 * subject, while this answers *"may a version be authored, and on which
 * branch"*. Merging them would hand B07's read model a lifecycle status it has
 * no business carrying, and hand this one a provenance pointer that is not
 * authorization.
 *
 * `AGG-13` ownership does not move: the contract is Ordering's, and it is
 * implemented against Ordering's own tables (TBL-037, TBL-038).
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from './custom-request.repository';

export const CUSTOM_REQUEST_DESIGN_CONTEXT_PORT = Symbol('CUSTOM_REQUEST_DESIGN_CONTEXT_PORT');

/**
 * One request, as design authoring is allowed to see it.
 *
 * Every field is here because a specific `APP6-B08` rule reads it, and nothing
 * is here that no rule reads: no `code`, no `customer_id`, no `customer_note`,
 * no moderation reason, no `current_quotation_id`, no timestamps. The SELECT
 * that never retrieves them is redaction no downstream projection can forget.
 *
 * The Catalog subject (`productId`, `productVariantId`) and the customer-owned
 * subject (`customerOwnedProductId`) are both optional **individually** and that
 * is deliberate: the branch is decided by `customerOwnedProductId` alone
 * (CST-027, at most one COP row per request), and an incomplete Catalog subject
 * is a refusal rather than something to be quietly completed. Modelling this as
 * a union here would have to invent which of the two a half-populated Catalog
 * request is — the honest answer is that it is a Catalog request that cannot be
 * authored, and only the caller's guard can say so.
 */
export interface CustomRequestDesignContext {
  readonly requestId: CustomRequestId;
  /** LC-11 state — `TR-LC08-01`'s eligibility guard reads exactly this. */
  readonly status: CustomRequestState;
  /** `custom_requests.current_design_case_id` — the canonical case pointer. */
  readonly currentDesignCaseId: string | undefined;
  readonly productId: ProductId | undefined;
  readonly productVariantId: ProductVariantId | undefined;
  /** Present exactly when this is a customer-owned-product request (CST-027). */
  readonly customerOwnedProductId: string | undefined;
  /** Provenance for the Catalog placement source; never an authorization input. */
  readonly submittedSessionId: string | undefined;
}

export interface CustomRequestDesignContextPort {
  /**
   * The design context of one request under a row lock, or nothing when the
   * request row is absent.
   *
   * Locked rather than merely read, because `TR-LC08-01`'s guard is the
   * request's **status** and an unlocked read of it is a decision made about a
   * value that may already have changed: a concurrent `APP6-B05` cancellation or
   * `APP6-B06` transition committing between the check and the insert would
   * leave a DRAFT version attached to a request that is no longer eligible for
   * one. Holding the request row for the rest of the authoring transaction is
   * the same seam `APP6-B05` uses, and it is the lock order the whole phase
   * follows — request first, then the design case.
   *
   * `@requiresTransaction`: a lock outside a transaction is released
   * immediately and would be a guard in name only.
   */
  lockDesignContext(id: CustomRequestId): Promise<CustomRequestDesignContext | undefined>;

  /**
   * The same context without a lock, for the read-only version list.
   *
   * A separate method rather than a boolean parameter: a list operation that
   * could be asked to take row locks is a list operation that eventually does,
   * and `FOR UPDATE` on a GET would serialise an Admin screen against every
   * concurrent write to the same request for no benefit.
   */
  findDesignContext(id: CustomRequestId): Promise<CustomRequestDesignContext | undefined>;
}

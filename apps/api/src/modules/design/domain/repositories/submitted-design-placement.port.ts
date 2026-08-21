/**
 * The Catalog placement a request's submitted Design Session was authored
 * against (`APP6-B08` §8, §10).
 *
 * A **second** read-only port over `design_sessions`, beside `APP6-B07`'s
 * `SubmittedDesignSourceRepository`, rather than four more fields on that one.
 * B07's descriptor says in as many words that it deliberately carries *"no
 * placement chain"*, and it says so because it answers a different question: B07
 * publishes the submitted **document** to an operator, while this resolves the
 * **identity** the formal version's placement columns are written from and is
 * never published anywhere. Widening B07's contract to serve this would put a
 * placement chain into a response projection that has no field for it, and would
 * make one port the answer to two questions that can diverge.
 *
 * ## Both ids, both server-owned — the same exactness rule as B07
 *
 * A caller never supplies a session id: `sessionId` comes from the request's own
 * `submitted_session_id`, and `requestId` is the request the operator was
 * already authorised for. Requiring both makes the exact-source rule a property
 * of the statement — the pointed row must point *back* at the same request — so
 * another request's session is unreachable rather than merely refused.
 *
 * ## No secret, and no document
 *
 * `session_secret_hash` is neither a parameter nor a projected column, and
 * neither is `design_document`: this port resolves geometry identity, and a
 * method here that returned a document would be B07 published a second time
 * without B07's controls.
 */
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export const SUBMITTED_DESIGN_PLACEMENT_PORT = Symbol('SUBMITTED_DESIGN_PLACEMENT_PORT');

/** The server-owned pair that addresses one submitted source, and only one. */
export interface SubmittedDesignPlacementLookup {
  /** `custom_requests.submitted_session_id`, never a caller-supplied value. */
  readonly sessionId: string;
  /** The request the operator was authorised for, and the row must agree. */
  readonly requestId: string;
}

/**
 * The Side and Area the customer actually designed against.
 *
 * `design_sessions` declares `product_id`, `product_side_id` and
 * `embroidery_area_id` NOT NULL, so all three are present whenever the row is —
 * which is also why a customer-owned-product request has no Design Session at
 * all (`ADR-APP6-001` §1.1) and this port is never consulted on that branch.
 *
 * The session's own `product_variant_id` is **not** here. It is nullable, and
 * the variant a formal version freezes is the *request's* subject rather than
 * whatever the Studio happened to record; reading it from two places is how the
 * two would eventually disagree.
 */
export interface SubmittedDesignPlacement {
  readonly productId: ProductId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
}

export interface SubmittedDesignPlacementPort {
  /**
   * The placement of this exact (request, session) pair, or nothing.
   *
   * Returning `undefined` is the only failure shape, exactly as in B07: a purged
   * row, a row belonging to another request and a row that is no longer
   * `SUBMITTED` evidence are indistinguishable to the caller. Unlike B07 the
   * caller does **not** render that absence as an honest `null` — a Catalog
   * version with no resolvable placement is refused, because the alternative is
   * substituting a placement, which is the failure `ADR-APP6-001` exists to
   * prevent.
   */
  findSubmittedPlacement(
    lookup: SubmittedDesignPlacementLookup,
  ): Promise<SubmittedDesignPlacement | undefined>;
}

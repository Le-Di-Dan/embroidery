/**
 * The request's submitted-design pointer, and nothing else (`APP6-B07` §5).
 *
 * A **fourth, read-only** Ordering contract beside {@link CustomRequestRepository}
 * (the AGG-13 write side), `CustomRequestStatusRepository` and
 * `CustomRequestQuotationPointerPort`, on exactly the reasoning `APP6-B04`
 * recorded for the third: what a module can inject is what its route can
 * eventually do. `CUSTOM_REQUEST_REPOSITORY` carries `submit`, `transition`,
 * `lockById` and `setCurrentQuotation`; a read surface that held it would be one
 * injection away from moving a request. This port has one method, it returns two
 * ids, and there is no write it could reach.
 *
 * It is a second pointer contract rather than a widening of the quotation one
 * for the same reason that one exists: `CustomRequestQuotationPointer` is
 * consumed by `APP6-B04`'s **public** customer surface, and adding
 * `submitted_session_id` to it would hand an anonymous caller's read model a
 * column it has no business carrying. Two narrow contracts keep each surface
 * reading exactly what it is allowed to know.
 *
 * `AGG-13` ownership does not move: the contract is Ordering's and it is
 * implemented against Ordering's own table (TBL-037).
 */
import type { CustomRequestId } from './custom-request.repository';

export const CUSTOM_REQUEST_DESIGN_SOURCE_PORT = Symbol('CUSTOM_REQUEST_DESIGN_SOURCE_PORT');

/**
 * What a request will say about the design it was submitted from.
 *
 * Two ids. No status, no code, no `customer_id`, no `current_quotation_id`, no
 * timestamps — an operator resolving the digitizing source has no use for them
 * here, and the SELECT that never retrieves them is redaction nobody downstream
 * can forget.
 *
 * `submittedSessionId` is `undefined` on a request that was never submitted from
 * a Design Session — every customer-owned-product request, by design
 * (`APP5-G01` §3), and that is a fact about the request rather than an error.
 * It is **provenance**: it selects the source only after the request itself has
 * been authorised, and it is never an authorization input on its own
 * (`design_sessions` header, `G01-D09`).
 */
export interface CustomRequestDesignSourcePointer {
  readonly requestId: CustomRequestId;
  readonly submittedSessionId: string | undefined;
}

export interface CustomRequestDesignSourcePort {
  /**
   * The pointer of one request, or nothing when the request row is absent.
   *
   * Absence is returned rather than thrown: this port states a fact, and the
   * caller — an Admin surface whose 404 is canonical — decides how to publish
   * it.
   */
  findDesignSourcePointer(
    id: CustomRequestId,
  ): Promise<CustomRequestDesignSourcePointer | undefined>;
}

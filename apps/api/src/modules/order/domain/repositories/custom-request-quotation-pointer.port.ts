/**
 * The request's current-quotation pointer, and nothing else (`APP6-B04` §7).
 *
 * A **third, read-only** Ordering contract beside {@link CustomRequestRepository}
 * and `CustomRequestStatusRepository`, for two reasons that point the same way.
 *
 * The first is the checkpoint's boundary. `APP6-B04` is a public, unauthenticated
 * surface holding a customer's secure-link token; what its module can inject is
 * what its route can eventually do. `CUSTOM_REQUEST_REPOSITORY` carries
 * `submit`, `transition`, `lockById` and `setCurrentQuotation` — the whole AGG-13
 * write side — and exporting it into a customer read module would put a
 * lifecycle transition one injection away from an anonymous caller. This port
 * has one method, it returns two ids, and there is no write it could reach.
 *
 * The second is that `CustomRequestStatusRepository` deliberately does **not**
 * carry the pointer: its row type names `current_quotation_id` in the list of
 * columns absent *by construction*, because the APP5 status screen must not
 * learn that a quotation exists. Widening that type to serve APP6 would delete
 * that property for `APP5-B03` as well. A second narrow contract keeps both
 * surfaces reading exactly what each is allowed to know.
 *
 * `AGG-13` ownership does not move: the contract is Ordering's and it is
 * implemented against Ordering's own table (TBL-037). CTX-QUO consumes it as a
 * port and never reads `custom_requests` itself
 * (`BACKEND_CONVENTIONS.md` §10).
 */
import type { CustomRequestId } from './custom-request.repository';

export const CUSTOM_REQUEST_QUOTATION_POINTER_PORT = Symbol(
  'CUSTOM_REQUEST_QUOTATION_POINTER_PORT',
);

/**
 * What a request will say about its quotation.
 *
 * Two ids. No status, no code, no `customer_id`, no `current_design_case_id`,
 * no timestamps — a caller resolving a quotation has no use for them, and the
 * SELECT that never retrieves them is redaction nobody downstream can forget.
 *
 * `currentQuotationId` is `undefined` on a request that has never had a
 * quotation sent (`APP6-B03` sets it, and only it does). That is a fact about
 * the request, not an error: the caller decides what to do with it, and on a
 * public surface the only safe answer is the same one an unusable token gets.
 */
export interface CustomRequestQuotationPointer {
  readonly requestId: CustomRequestId;
  readonly currentQuotationId: string | undefined;
}

export interface CustomRequestQuotationPointerPort {
  /**
   * The pointer of one request, or nothing when the request row is absent.
   *
   * Never throws for absence — the caller is a non-enumerating public surface
   * and must not be handed a distinguishable failure to report.
   */
  findQuotationPointer(id: CustomRequestId): Promise<CustomRequestQuotationPointer | undefined>;
}

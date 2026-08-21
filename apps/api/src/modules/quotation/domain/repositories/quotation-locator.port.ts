/**
 * Where a request's quotation lives, and nothing else (`APP6-A01` §4).
 *
 * A **port**, on the pattern `catalog-subject.port.ts` records: the Admin
 * request-detail read belongs to Ordering, and Ordering must not call Quotation's
 * concrete repository or read `quotations` itself
 * (`BACKEND_CONVENTIONS.md` §10). It depends on this interface; Quotation
 * provides the implementation.
 *
 * ### Why not inject `QUOTATION_REPOSITORY`
 *
 * The delivered AGG-14 contract already answers this question —
 * `findByRequest(customRequestId)` resolves the unique request→quotation
 * relation. But it also carries `send`, `accept`, `reject`, `expire`,
 * `addVersion` and `setCurrentVersion`. `QuotationReadModule` wrote down why
 * that matters: *what a module can inject is what its routes can eventually
 * do*. `CustomRequestAdminModule` is a read module that deliberately does not
 * import `OrderModule` so that nothing composed there can transition a request;
 * handing it the quotation write repository to answer a locator question would
 * undo exactly that, and it would let a later edit set `current_quotation_id`
 * from a `GET`. This port exposes one read and no verb.
 *
 * ### Why it returns an id and not a quotation
 *
 * The caller needs to *address* `APP6-B02`, not to describe a quotation. A
 * status, a code or a version pointer returned here would be a second projection
 * of a quotation living outside the module that owns one, and `APP5-B04`'s
 * response is explicit that it publishes no APP6 business content. An id is the
 * whole answer: the screen that has it calls B02, which is the single authority
 * on what a quotation looks like.
 *
 * ### Why not `current_quotation_id`
 *
 * `custom_requests.current_quotation_id` is the customer-current pointer and
 * `APP6-B03` sets it **on send**. It is NULL for every quotation that has only
 * ever been drafted, which is precisely the case this port exists to answer: an
 * operator who drafted a quotation and reloaded the page has to find it again.
 * The relation itself — one quotation per request, by `custom_request_id` — is
 * the locator, and it is already unique.
 */
export const QUOTATION_LOCATOR_PORT = Symbol('QUOTATION_LOCATOR_PORT');

export interface QuotationLocatorPort {
  /**
   * The id of the one quotation belonging to this request, or nothing.
   *
   * `undefined` means no quotation has ever been created for the request — the
   * honest empty state — and never "a quotation exists but is not current yet".
   * The answer is the same id for a DRAFT, a SENT and every later header state,
   * because a quotation's identity does not change when its lifecycle does.
   */
  findQuotationIdForRequest(customRequestId: string): Promise<string | undefined>;
}

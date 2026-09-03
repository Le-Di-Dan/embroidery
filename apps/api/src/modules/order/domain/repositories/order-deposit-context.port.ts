/**
 * The order a customer's request opens onto, and nothing else (`APP7-B03` §8).
 *
 * A **read-only** Ordering contract beside {@link OrderRepository} and
 * `AdminOrderReadRepository`, for the reason `CustomRequestQuotationPointerPort`
 * exists: CTX-PAY needs to reach the order behind a `REQUEST_ACCESS` grant, and
 * `BACKEND_CONVENTIONS.md` §10 forbids it from reading Ordering's tables. The
 * contract is Ordering's and is implemented against Ordering's own table
 * (TBL-043); Payment consumes it as a port.
 *
 * `ORDER_REPOSITORY` is the AGG-15 **writer** — `createFromAcceptedQuotation`,
 * `transition`, `dispatch`, `openCancellationRequest`. Exporting it into a
 * public customer payment surface would put an LC-14 transition one injection
 * away from an anonymous caller holding a link. This port has one method, it
 * returns three fields, and there is no write it could reach.
 *
 * `AdminOrderReadRepository` is not reused either: it is a queue-and-detail
 * projection keyed by order id, built for an authenticated operator, and it
 * carries `customerId`, `acceptedQuotationVersionId`, `currentApprovalSnapshotId`
 * and the frozen line items. A customer deposit surface needs none of those, and
 * a SELECT that never retrieves them is redaction nobody downstream can forget.
 */
import type { OrderOrigin, OrderState } from '@embroidery/database';

import type { CustomRequestId } from './custom-request.repository';

export const ORDER_DEPOSIT_CONTEXT_PORT = Symbol('ORDER_DEPOSIT_CONTEXT_PORT');

/**
 * What an order will say to the surface collecting money against it.
 *
 * Four fields. `id` addresses the obligation, `code` derives the transfer
 * reference and identifies the order on screen, `status` is the LC-14 state the
 * surface must report truthfully, and `origin` says which obligation kind the
 * order carries at all.
 *
 * ### `origin` (`APP12-A02-C1`)
 *
 * Added for the **Admin** payment read, which until this correction assumed
 * every order had a `DEPOSIT` and answered `ORDER_NOT_FOUND` for the Ready-Made
 * half of the shop. `BR-029` gives a Ready-Made order one `FULL` obligation and
 * no deposit at any point in its life, so the read has to know which kind to
 * ask for — and `COL-TBL043-12` is the only fact that says so. Deriving it from
 * which obligation happens to exist would invert the dependency: an order
 * before its first shipping fee has **no** obligation at all, and that must
 * read as "not priced yet", never as "not a Ready-Made order".
 *
 * It rides on this port rather than `ORDER_ORIGIN_PORT` because that symbol is
 * exported by `OrderPersistenceModule` beside `ORDER_REPOSITORY`; importing it
 * into a payment **read** module would hand a zero-write query a `transition()`.
 * This port is already Ordering-owned, already read-only and already the one
 * the Admin payment read resolves its order through.
 *
 * `customerId`, `acceptedQuotationVersionId`, `currentApprovalSnapshotId`,
 * `totalAmount` and the timestamps are deliberately absent: the payable amount
 * is the obligation's, never the order total, and the rest are facts a payment
 * surface has no use for.
 */
export interface OrderDepositContext {
  readonly id: string;
  readonly code: string;
  readonly status: OrderState;
  /** `COL-TBL043-12` — immutable, and what decides the payable obligation kind. */
  readonly origin: OrderOrigin;
}

export interface OrderDepositContextPort {
  /**
   * The one order of one request (`uq_orders__request`), or nothing.
   *
   * Never throws for absence. The caller is a non-enumerating public surface and
   * must not be handed a distinguishable failure to report — a request that has
   * not been converted yet and a request that does not exist have to look the
   * same from outside.
   */
  findOrderForRequest(requestId: CustomRequestId): Promise<OrderDepositContext | undefined>;

  /**
   * The same three fields, addressed by the order's own id (`APP7-B04` §7).
   *
   * The Admin payment read is given an `orderId` in its path, so it has no
   * request to walk from. It gets a second method on **this** port rather than
   * `ORDER_REPOSITORY` for the reason the port exists at all: a CTX-PAY read
   * surface must not acquire `transition()` in order to learn an order's code,
   * and `AdminOrderReadRepository` is Ordering's own queue-and-detail projection
   * — reusing it would put the frozen line items, the customer id and both
   * snapshot references into a payment response that has no use for them.
   *
   * Never throws for absence, on the same terms as
   * {@link OrderDepositContextPort.findOrderForRequest}: the caller decides what
   * an unknown order means on its own surface.
   */
  findOrderById(orderId: string): Promise<OrderDepositContext | undefined>;
}

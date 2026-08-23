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
import type { OrderState } from '@embroidery/database';

import type { CustomRequestId } from './custom-request.repository';

export const ORDER_DEPOSIT_CONTEXT_PORT = Symbol('ORDER_DEPOSIT_CONTEXT_PORT');

/**
 * What an order will say to the customer paying its deposit.
 *
 * Three fields. `id` addresses the DEPOSIT obligation, `code` derives the
 * transfer reference and identifies the order on the customer's screen, and
 * `status` is the LC-14 state the deposit surface must report truthfully.
 *
 * `customerId`, `acceptedQuotationVersionId`, `currentApprovalSnapshotId`,
 * `totalAmount` and the timestamps are deliberately absent: the deposit amount
 * is the obligation's, never the order total, and the rest are facts the paying
 * customer has no use for.
 */
export interface OrderDepositContext {
  readonly id: string;
  readonly code: string;
  readonly status: OrderState;
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
}

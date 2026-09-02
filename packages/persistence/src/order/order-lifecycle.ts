/**
 * The order facts every origin has, and the only shape a shared lifecycle
 * command may read (`APP12-B05`).
 *
 * ### Why a second shape rather than a widened `Order`
 *
 * `Order` is the **custom** aggregate. `APP12-DB01` made the three custom-chain
 * columns nullable for `READY_MADE`, and `toOrder` refuses such a row rather
 * than mapping it with empty strings — deliberately, because every consumer of
 * that aggregate reads at least one of the three. Widening those fields to
 * optional would push a `| undefined` into the quotation, approval and request
 * readers that have a real chain to read, and each would have to re-assert what
 * the mapper asserts once.
 *
 * The cost of that decision, which `APP12-B05` had to pay, is that four
 * delivered seams — `findById`, `loadForUpdate`, `transition` and `dispatch` —
 * were unreachable for a Ready-Made order, and with them
 * `adminPaymentAttempt_verify`, `adminOrder_dispatch` and `adminOrder_complete`.
 * Those three commands are **origin-neutral by design**: dispatching a parcel
 * and closing an order are the same act whichever way the order was created.
 *
 * So the fix is not to widen the custom aggregate and not to fork the commands.
 * It is to publish the intersection: the columns that are `NOT NULL` on every
 * `orders` row, plus the discriminator, so a shared command can read committed
 * state, branch on `origin` where the business genuinely differs (which
 * obligation kind `GRD-016` names), and move the row — without ever touching a
 * chain that may not exist.
 *
 * ### The discriminator is carried, not re-fetched
 *
 * `tg_orders__origin_immutable` makes `origin` stable for the life of the row,
 * so a command that has this shape under the row's own lock needs no second
 * read and no `OrderOriginPort` call to know which shape it is holding.
 */
import type { OrderOrigin, OrderState } from '@embroidery/database';

import type { OrderId } from './order.repository';

export interface OrderLifecycle {
  readonly id: OrderId;
  readonly code: string;
  readonly customerId: string;
  /** `COL-TBL043-12` — immutable, so it may be read once and carried. */
  readonly origin: OrderOrigin;
  readonly status: OrderState;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly deliveredAt: Date | undefined;
}
